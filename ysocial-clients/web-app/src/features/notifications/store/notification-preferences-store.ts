import { create } from "zustand";
import { useAuthStore } from "@/features/auth";
import { isRealApi } from "@/lib/api-config";
import { fetchNotificationPreferences, saveNotificationPreferences } from "../services/notification-service";
import type { NotificationPreferences } from "../types";

// Server state of the viewer's notification kinds (MAP §2.7 preferences). `desired` is what the switches show,
// `confirmed` the last value the server stored. Edits are optimistic and COALESCED: one save at a time, toggles made
// meanwhile only move `desired`, and the follow-up save sends the newest full object. A failure reverts to
// `confirmed` only when nothing newer is pending, so an old answer can never overwrite a newer toggle.

interface PreferencesState {
  status: "idle" | "loading" | "ready" | "error";
  desired: NotificationPreferences | null;
  confirmed: NotificationPreferences | null;
  saving: boolean;
}

const INITIAL: PreferencesState = { status: "idle", desired: null, confirmed: null, saving: false };

export const useNotificationPreferencesStore = create<PreferencesState>(() => ({ ...INITIAL }));

const set = useNotificationPreferencesStore.setState;
const get = useNotificationPreferencesStore.getState;

/** Bumped by every reset & every load: an answer of an older one is stale. */
let generation = 0;
let flushInFlight: Promise<boolean> | null = null;

/** Drops everything (logout, account switch, tests). */
export function resetPreferencesStore(): void {
  generation += 1;
  flushInFlight = null;
  set({ ...INITIAL });
}

const same = (a: NotificationPreferences | null, b: NotificationPreferences | null): boolean =>
  a !== null && b !== null && a.likes === b.likes && a.replies === b.replies && a.follows === b.follows;

const isGuestOnRealList = (): boolean => isRealApi("activity") && !useAuthStore.getState().isAuthenticated;

export async function loadPreferences(): Promise<void> {
  if (isGuestOnRealList()) return;
  generation += 1;
  const started = generation;
  set({ status: "loading" });
  try {
    const preferences = await fetchNotificationPreferences();
    if (generation === started) set({ status: "ready", desired: preferences, confirmed: preferences });
  } catch {
    if (generation === started) set({ status: "error" });
  }
}

/**
 * Flips one kind. Resolves true when the server holds the final desired state, false when it was rejected (state
 * reverted) or nothing could be edited yet. Concurrent calls share one flush.
 */
export function setPreference(key: keyof NotificationPreferences, value: boolean): Promise<boolean> {
  const { status, desired } = get();
  if (status !== "ready" || !desired) return Promise.resolve(false);
  set({ desired: { ...desired, [key]: value } });
  if (!flushInFlight) {
    const run = flush().finally(() => {
      if (flushInFlight === run) flushInFlight = null;
    });
    flushInFlight = run;
  }
  return flushInFlight;
}

async function flush(): Promise<boolean> {
  const started = generation;
  set({ saving: true });
  for (;;) {
    const sending = get().desired;
    if (!sending || same(sending, get().confirmed)) break;
    try {
      const stored = await saveNotificationPreferences(sending);
      if (generation !== started) return false;
      set({ confirmed: stored });
    } catch {
      if (generation !== started) return false;
      // Newer toggles are pending: their full object is saved next, so nothing is reverted under the user's hand
      if (same(get().desired, sending)) {
        set({ desired: get().confirmed, saving: false });
        return false;
      }
    }
  }
  set({ saving: false });
  return same(get().desired, get().confirmed);
}
