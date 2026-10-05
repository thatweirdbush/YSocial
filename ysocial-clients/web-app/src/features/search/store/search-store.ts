import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import type { TagSort } from "@/features/posts/types";
import { normalizeText } from "@/lib/text";
import type { SearchResult, TagPageCache } from "../types";

// Recent searches (persisted) + last search / tag page results (session cache, so Back renders instantly).

export const RECENT_LIMIT = 10;

const STORAGE_KEY = "ysocial_recent_searches";

interface SearchStoreData {
  recent: string[];
  result: SearchResult | null;
  tagPages: Record<string, TagPageCache>;
}

interface SearchStoreActions {
  /** Trims, ignores blank, dedupes by normalized text, newest first, max `RECENT_LIMIT`. */
  addRecent: (query: string) => void;
  removeRecent: (query: string) => void;
  clearRecent: () => void;
  setResult: (result: SearchResult) => void;
  setTagPage: (key: string, page: TagPageCache) => void;
}

interface SearchStoreState extends SearchStoreData {
  actions: SearchStoreActions;
}

const initialData = (): SearchStoreData => ({ recent: [], result: null, tagPages: {} });

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

const withoutQuery = (list: string[], query: string) => {
  const key = normalizeText(query);
  return list.filter((item) => normalizeText(item) !== key);
};

export const useSearchStore = create<SearchStoreState>()(
  persist(
    (set) => ({
      ...initialData(),
      actions: {
        addRecent: (query) =>
          set((state) => {
            const trimmed = query.trim();
            if (!normalizeText(trimmed)) return state;
            return { recent: [trimmed, ...withoutQuery(state.recent, trimmed)].slice(0, RECENT_LIMIT) };
          }),
        removeRecent: (query) => set((state) => ({ recent: withoutQuery(state.recent, query) })),
        clearRecent: () => set({ recent: [] }),
        setResult: (result) => set({ result }),
        setTagPage: (key, page) => set((state) => ({ tagPages: { ...state.tagPages, [key]: page } })),
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({ recent: state.recent }),
      // SSR-safe: server & first client render use empty state; Providers rehydrates after mount
      skipHydration: true,
    },
  ),
);

export const tagPageKey = (tag: string, sort: TagSort) => `${normalizeText(tag)}:${sort}`;

/** Test-only: clear data, keep actions. */
export const resetSearchStore = () => useSearchStore.setState(initialData());

// #region Selectors
export const useRecentSearches = () => useSearchStore((state) => state.recent);
export const useSearchResult = () => useSearchStore((state) => state.result);
export const useTagPage = (key: string) => useSearchStore((state) => state.tagPages[key]);
export const useSearchActions = () => useSearchStore((state) => state.actions);
// #endregion
