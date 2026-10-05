import { create } from "zustand";
import type { UserProfile } from "../types";

// Normalized client cache of users. Every screen reads the same entity via useUser(id),
// so follow changes are reflected everywhere in O(1).

interface UserStoreData {
  users: Record<string, UserProfile>;
}

interface UserStoreActions {
  upsertUsers: (users: UserProfile[]) => void;
  /** Flips `isFollowing` & adjusts `followersCount`; unknown id -> no-op. */
  toggleFollow: (id: string) => void;
}

interface UserStoreState extends UserStoreData {
  actions: UserStoreActions;
}

const initialData = (): UserStoreData => ({ users: {} });

export const useUserStore = create<UserStoreState>((set) => ({
  ...initialData(),
  actions: {
    upsertUsers: (users) =>
      set((state) => {
        const next = { ...state.users };
        for (const user of users) next[user.id] = user;
        return { users: next };
      }),

    toggleFollow: (id) =>
      set((state) => {
        const user = state.users[id];
        if (!user) return state;
        const following = !user.isFollowing;
        return {
          users: {
            ...state.users,
            [id]: {
              ...user,
              isFollowing: following,
              followersCount: Math.max(0, user.followersCount + (following ? 1 : -1)),
            },
          },
        };
      }),
  },
}));

/** Test-only: clear cached data, keep actions. */
export const resetUserStore = () => useUserStore.setState(initialData());

// #region Selectors
export const useUser = (id: string) => useUserStore((state) => state.users[id]);
export const useUserActions = () => useUserStore((state) => state.actions);
// #endregion
