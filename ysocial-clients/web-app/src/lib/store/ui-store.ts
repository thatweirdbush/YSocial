import { create } from "zustand";

export type LocaleType = "vi" | "en";

interface UIState {
  locale: LocaleType;
  isCollapsed: boolean;
  actions: {
    setLocale: (locale: LocaleType) => void;
    setIsCollapsed: (collapsed: boolean) => void;
    toggleSidebar: () => void;
  };
}

export const useUIStore = create<UIState>((set) => {
  // Client-safe initial locale reading
  let initialLocale: LocaleType = "vi";
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("ysocial_locale") as LocaleType;
    if (saved === "vi" || saved === "en") {
      initialLocale = saved;
    } else {
      const browserLang = navigator.language.split("-")[0];
      initialLocale = browserLang === "en" ? "en" : "vi";
    }
  }

  return {
    locale: initialLocale,
    isCollapsed: false,
    actions: {
      setLocale: (locale) => {
        if (typeof window !== "undefined") {
          localStorage.setItem("ysocial_locale", locale);
        }
        set({ locale });
      },
      setIsCollapsed: (isCollapsed) => set({ isCollapsed }),
      toggleSidebar: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
    },
  };
});

// Selectors for clean and efficient re-rendering
export const useLocale = () => useUIStore((state) => state.locale);
export const useIsCollapsed = () => useUIStore((state) => state.isCollapsed);
export const useUIActions = () => useUIStore((state) => state.actions);
export const useUIState = () => useUIStore((state) => ({ 
  locale: state.locale, 
  isCollapsed: state.isCollapsed,
  actions: state.actions 
}));
