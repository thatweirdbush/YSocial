import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { useShallow } from "zustand/react/shallow";

// Viewer DISPLAY preferences, scoped to this DEVICE (not the profile): they survive profile switch & logout.
// Theme stays in `next-themes`, locale in `ui-store`.

export type FontSize = "sm" | "md" | "lg";
/** `system` = follow OS `prefers-reduced-motion`; `reduce` = force reduced even when the OS allows motion. */
export type ReducedMotion = "system" | "reduce";

export const SETTINGS_STORAGE_KEY = "ysocial_settings_v1";

const FONT_SIZES: readonly FontSize[] = ["sm", "md", "lg"];
const MOTIONS: readonly ReducedMotion[] = ["system", "reduce"];

interface SettingsData {
  fontSize: FontSize;
  reducedMotion: ReducedMotion;
  hideLikeCounts: boolean;
  hideShareCounts: boolean;
}

interface SettingsActions {
  setFontSize: (fontSize: FontSize) => void;
  setReducedMotion: (reducedMotion: ReducedMotion) => void;
  setHideLikeCounts: (hide: boolean) => void;
  setHideShareCounts: (hide: boolean) => void;
}

interface SettingsState extends SettingsData {
  actions: SettingsActions;
}

const initialData = (): SettingsData => ({ fontSize: "md", reducedMotion: "system", hideLikeCounts: false, hideShareCounts: false });

/** localStorage that never throws (private mode / blocked storage -> in-memory only). */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // Ignore persistence failure; in-memory state still updates
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      // Ignore
    }
  },
};

const pick = <T extends string>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.find((item) => item === value) ?? fallback;

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialData(),
      actions: {
        setFontSize: (fontSize) => set({ fontSize }),
        setReducedMotion: (reducedMotion) => set({ reducedMotion }),
        setHideLikeCounts: (hideLikeCounts) => set({ hideLikeCounts }),
        setHideShareCounts: (hideShareCounts) => set({ hideShareCounts }),
      },
    }),
    {
      name: SETTINGS_STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ fontSize, reducedMotion, hideLikeCounts, hideShareCounts }) => ({ fontSize, reducedMotion, hideLikeCounts, hideShareCounts }),
      // Storage is user-editable: never trust the shape
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<Record<keyof SettingsData, unknown>>;
        const defaults = initialData();
        return {
          ...current,
          fontSize: pick(FONT_SIZES, raw.fontSize, defaults.fontSize),
          reducedMotion: pick(MOTIONS, raw.reducedMotion, defaults.reducedMotion),
          hideLikeCounts: typeof raw.hideLikeCounts === "boolean" ? raw.hideLikeCounts : defaults.hideLikeCounts,
          hideShareCounts: typeof raw.hideShareCounts === "boolean" ? raw.hideShareCounts : defaults.hideShareCounts,
        };
      },
      // SSR-safe: server & first client render use defaults; Providers rehydrates after mount
      skipHydration: true,
    },
  ),
);

/** Test-only: back to defaults, keep actions. */
export const resetSettingsStore = () => useSettingsStore.setState(initialData());

// #region Selectors
export const useFontSize = () => useSettingsStore((state) => state.fontSize);
export const useReducedMotion = () => useSettingsStore((state) => state.reducedMotion);
export const useDisplayPrefs = () =>
  useSettingsStore(useShallow((state) => ({ hideLikeCounts: state.hideLikeCounts, hideShareCounts: state.hideShareCounts })));
export const useSettingsActions = () => useSettingsStore((state) => state.actions);
// #endregion
