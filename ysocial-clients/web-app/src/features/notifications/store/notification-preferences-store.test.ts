import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth";
import { setRealSlices } from "@/test/api-test-utils";
import * as service from "../services/notification-service";
import type { NotificationPreferences } from "../types";
import {
  loadPreferences,
  resetPreferencesStore,
  setPreference,
  useNotificationPreferencesStore,
} from "./notification-preferences-store";

const ON: NotificationPreferences = { likes: true, replies: true, follows: true };
const state = () => useNotificationPreferencesStore.getState();
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  resetPreferencesStore();
  setRealSlices("auth,content,graph,activity");
  useAuthStore.setState({ isAuthenticated: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  useAuthStore.setState({ isAuthenticated: false });
});

describe("loading", () => {
  it("starts idle with nothing editable, then fills desired & confirmed from the BE", async () => {
    expect(state()).toMatchObject({ status: "idle", desired: null, confirmed: null });
    vi.spyOn(service, "fetchNotificationPreferences").mockResolvedValue({ likes: true, replies: false, follows: true });
    await loadPreferences();
    expect(state()).toMatchObject({ status: "ready", desired: { likes: true, replies: false, follows: true }, confirmed: { likes: true, replies: false, follows: true } });
  });

  it("failure -> error (retry loads)", async () => {
    const spy = vi.spyOn(service, "fetchNotificationPreferences").mockRejectedValueOnce(new Error("down")).mockResolvedValue(ON);
    await loadPreferences();
    expect(state().status).toBe("error");
    await loadPreferences();
    expect(state().status).toBe("ready");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("a reset during the load drops the stale answer", async () => {
    const load = deferred<NotificationPreferences>();
    vi.spyOn(service, "fetchNotificationPreferences").mockReturnValue(load.promise);
    const pending = loadPreferences();
    resetPreferencesStore();
    load.resolve({ likes: false, replies: false, follows: false });
    await pending;
    expect(state()).toMatchObject({ status: "idle", desired: null });
  });

  it("a real-mode guest makes no request", async () => {
    useAuthStore.setState({ isAuthenticated: false });
    const spy = vi.spyOn(service, "fetchNotificationPreferences");
    await loadPreferences();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("toggling", () => {
  beforeEach(async () => {
    vi.spyOn(service, "fetchNotificationPreferences").mockResolvedValue(ON);
    await loadPreferences();
  });

  it("no mutation before the first load completed", async () => {
    resetPreferencesStore();
    const save = vi.spyOn(service, "saveNotificationPreferences");
    await expect(setPreference("likes", false)).resolves.toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(state().desired).toBeNull();
  });

  it("is optimistic and sends the FULL object", async () => {
    const save = vi.spyOn(service, "saveNotificationPreferences").mockImplementation(async (preferences) => preferences);
    const done = setPreference("likes", false);
    expect(state().desired).toEqual({ likes: false, replies: true, follows: true });
    await expect(done).resolves.toBe(true);
    expect(save).toHaveBeenCalledWith({ likes: false, replies: true, follows: true });
    expect(state().confirmed).toEqual({ likes: false, replies: true, follows: true });
  });

  it("reverts to the last confirmed value when the save fails and nothing newer is pending", async () => {
    vi.spyOn(service, "saveNotificationPreferences").mockRejectedValue(new Error("500"));
    await expect(setPreference("replies", false)).resolves.toBe(false);
    expect(state().desired).toEqual(ON);
    expect(state().confirmed).toEqual(ON);
  });

  it("A off, A on, B off while the first save is in flight and FAILS: no stale revert, the latest desired is saved", async () => {
    const first = deferred<NotificationPreferences>();
    const save = vi
      .spyOn(service, "saveNotificationPreferences")
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (preferences) => preferences);

    const a1 = setPreference("likes", false);
    const a2 = setPreference("likes", true);
    const b = setPreference("follows", false);
    expect(state().desired).toEqual({ likes: true, replies: true, follows: false });
    expect(save).toHaveBeenCalledTimes(1);

    first.reject(new Error("500"));
    await Promise.all([a1, a2, b]);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ likes: true, replies: true, follows: false });
    expect(state().desired).toEqual({ likes: true, replies: true, follows: false });
    expect(state().confirmed).toEqual({ likes: true, replies: true, follows: false });
  });

  it("at most one save in flight: toggles meanwhile are coalesced into one follow-up with the newest values", async () => {
    const first = deferred<NotificationPreferences>();
    const save = vi
      .spyOn(service, "saveNotificationPreferences")
      .mockReturnValueOnce(first.promise)
      .mockImplementation(async (preferences) => preferences);

    const pending = [setPreference("likes", false), setPreference("replies", false), setPreference("follows", false), setPreference("replies", true)];
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve({ likes: false, replies: true, follows: true });
    await Promise.all(pending);

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ likes: false, replies: true, follows: false });
    expect(state().confirmed).toEqual({ likes: false, replies: true, follows: false });
  });

  it("a slow answer of save #1 never overwrites a newer toggle (desired is not replaced by the response)", async () => {
    const first = deferred<NotificationPreferences>();
    vi.spyOn(service, "saveNotificationPreferences").mockReturnValueOnce(first.promise).mockImplementation(async (preferences) => preferences);
    const a = setPreference("likes", false);
    const b = setPreference("follows", false);
    first.resolve({ likes: false, replies: true, follows: true });
    await Promise.all([a, b]);
    expect(state().desired).toEqual({ likes: false, replies: true, follows: false });
  });

  it("a failing follow-up after a good first save reverts only to the last confirmed state", async () => {
    vi.spyOn(service, "saveNotificationPreferences")
      .mockImplementationOnce(async (preferences) => preferences)
      .mockRejectedValueOnce(new Error("500"));
    await setPreference("likes", false);
    await expect(setPreference("replies", false)).resolves.toBe(false);
    expect(state().desired).toEqual({ likes: false, replies: true, follows: true });
    expect(state().confirmed).toEqual({ likes: false, replies: true, follows: true });
  });

  it("a reset while saving drops the outcome", async () => {
    const first = deferred<NotificationPreferences>();
    vi.spyOn(service, "saveNotificationPreferences").mockReturnValue(first.promise);
    const done = setPreference("likes", false);
    resetPreferencesStore();
    first.resolve({ likes: false, replies: true, follows: true });
    await done;
    expect(state()).toMatchObject({ status: "idle", desired: null, confirmed: null });
  });
});
