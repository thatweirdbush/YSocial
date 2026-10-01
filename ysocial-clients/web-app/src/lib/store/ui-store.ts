import { create } from "zustand";

export type LocaleType = "vi" | "en";

const LOCALE_STORAGE_KEY = "ysocial_locale";

/** Default locale used for SSR and the first client render (must match to avoid hydration mismatch). */
export const DEFAULT_LOCALE: LocaleType = "vi";

interface UIState {
  locale: LocaleType;
  isCollapsed: boolean;
  actions: {
    setLocale: (locale: LocaleType) => void;
    /** Applies the persisted / browser locale. Call once after mount on the client. */
    hydrateLocale: () => void;
    setIsCollapsed: (collapsed: boolean) => void;
    toggleSidebar: () => void;
  };
}

/** Reads the persisted locale, falling back to the browser language. Client-only. */
const resolveClientLocale = (): LocaleType => {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "vi" || saved === "en") {
      return saved;
    }
  } catch {
    // Storage may be blocked (private mode); fall through to browser language
  }
  return navigator.language.split("-")[0] === "en" ? "en" : DEFAULT_LOCALE;
};

export const useUIStore = create<UIState>((set) => ({
  locale: DEFAULT_LOCALE,
  isCollapsed: false,
  actions: {
    setLocale: (locale) => {
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, locale);
      } catch {
        // Ignore persistence failure; in-memory locale still updates
      }
      set({ locale });
    },
    hydrateLocale: () => set({ locale: resolveClientLocale() }),
    setIsCollapsed: (isCollapsed) => set({ isCollapsed }),
    toggleSidebar: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
  },
}));

// Selectors for clean and efficient re-rendering
export const useLocale = () => useUIStore((state) => state.locale);
export const useIsCollapsed = () => useUIStore((state) => state.isCollapsed);
export const useUIActions = () => useUIStore((state) => state.actions);
export const useUIState = () => useUIStore((state) => ({
  locale: state.locale,
  isCollapsed: state.isCollapsed,
  actions: state.actions
}));
