import { create } from "zustand";
import type { FeedTab, PostItem } from "../types";

// Normalized client cache of posts. Every screen reads the same entity via usePost(id),
// so like/bookmark/reply changes are reflected everywhere in O(1).

/** Paging state lives in the store (not the feed component) so a remounted feed reuses loaded pages. */
export interface FeedMeta {
  loaded: boolean;
  nextPage?: number;
}

interface PostStoreData {
  posts: Record<string, PostItem>;
  replyIds: Record<string, string[]>;
  feedIds: Record<FeedTab, string[]>;
  feedMeta: Record<FeedTab, FeedMeta>;
}

interface PostStoreActions {
  upsertPosts: (posts: PostItem[]) => void;
  /** Appending skips ids already cached (offset pages shift after prependPost). */
  setFeedPage: (tab: FeedTab, ids: string[], append: boolean, nextPage?: number) => void;
  setReplies: (parentId: string, ids: string[]) => void;
  /** `seed` inserts the post first when it is not cached yet (e.g. Saved page items). */
  toggleLike: (id: string, seed?: PostItem) => void;
  toggleBookmark: (id: string, seed?: PostItem) => void;
  addReply: (parentId: string, reply: PostItem) => void;
  removeReply: (parentId: string, replyId: string) => void;
  prependPost: (tab: FeedTab, post: PostItem) => void;
}

interface PostStoreState extends PostStoreData {
  actions: PostStoreActions;
}

const EMPTY_IDS: readonly string[] = Object.freeze([]);

const initialData = (): PostStoreData => ({
  posts: {},
  replyIds: {},
  feedIds: { forYou: [], following: [] },
  feedMeta: { forYou: { loaded: false, nextPage: undefined }, following: { loaded: false, nextPage: undefined } },
});

/** Returns updated posts map, or null when the post is unknown and no seed is given. */
function updatePost(
  posts: Record<string, PostItem>,
  id: string,
  seed: PostItem | undefined,
  update: (post: PostItem) => PostItem,
): Record<string, PostItem> | null {
  const current = posts[id] ?? seed;
  if (!current) return null;
  return { ...posts, [id]: update(current) };
}

export const usePostStore = create<PostStoreState>((set) => ({
  ...initialData(),
  actions: {
    upsertPosts: (posts) =>
      set((state) => {
        const next = { ...state.posts };
        for (const post of posts) next[post.id] = post;
        return { posts: next };
      }),

    setFeedPage: (tab, ids, append, nextPage) =>
      set((state) => {
        let nextIds = ids;
        if (append) {
          const cached = new Set(state.feedIds[tab]);
          nextIds = [...state.feedIds[tab], ...ids.filter((id) => !cached.has(id))];
        }
        return {
          feedIds: { ...state.feedIds, [tab]: nextIds },
          feedMeta: { ...state.feedMeta, [tab]: { loaded: true, nextPage } },
        };
      }),

    setReplies: (parentId, ids) =>
      set((state) => ({ replyIds: { ...state.replyIds, [parentId]: ids } })),

    toggleLike: (id, seed) =>
      set((state) => {
        const posts = updatePost(state.posts, id, seed, (post) => {
          const liked = !post.isLikedByCurrentUser;
          return {
            ...post,
            isLikedByCurrentUser: liked,
            likesCount: Math.max(0, post.likesCount + (liked ? 1 : -1)),
          };
        });
        return posts ? { posts } : state;
      }),

    toggleBookmark: (id, seed) =>
      set((state) => {
        const posts = updatePost(state.posts, id, seed, (post) => ({
          ...post,
          isBookmarkedByCurrentUser: !post.isBookmarkedByCurrentUser,
        }));
        return posts ? { posts } : state;
      }),

    addReply: (parentId, reply) =>
      set((state) => {
        const ids = state.replyIds[parentId] ?? [];
        const isNew = !ids.includes(reply.id);
        const posts = { ...state.posts, [reply.id]: reply };
        const parent = posts[parentId];
        if (isNew && parent) {
          posts[parentId] = { ...parent, commentsCount: parent.commentsCount + 1 };
        }
        return {
          posts,
          replyIds: isNew ? { ...state.replyIds, [parentId]: [reply.id, ...ids] } : state.replyIds,
        };
      }),

    removeReply: (parentId, replyId) =>
      set((state) => {
        const ids = state.replyIds[parentId] ?? [];
        if (!ids.includes(replyId)) return state;

        const posts = { ...state.posts };
        delete posts[replyId];
        const parent = posts[parentId];
        if (parent) {
          posts[parentId] = { ...parent, commentsCount: Math.max(0, parent.commentsCount - 1) };
        }
        return {
          posts,
          replyIds: { ...state.replyIds, [parentId]: ids.filter((id) => id !== replyId) },
        };
      }),

    prependPost: (tab, post) =>
      set((state) => ({
        posts: { ...state.posts, [post.id]: post },
        feedIds: { ...state.feedIds, [tab]: [post.id, ...state.feedIds[tab].filter((id) => id !== post.id)] },
      })),
  },
}));

/** Test-only: clear cached data, keep actions. */
export const resetPostStore = () => usePostStore.setState(initialData());

// #region Selectors
export const usePost = (id: string) => usePostStore((state) => state.posts[id]);
export const useReplyIds = (parentId: string) =>
  usePostStore((state) => state.replyIds[parentId] ?? EMPTY_IDS);
export const useFeedIds = (tab: FeedTab) => usePostStore((state) => state.feedIds[tab]);
export const useFeedMeta = (tab: FeedTab) => usePostStore((state) => state.feedMeta[tab]);
export const usePostActions = () => usePostStore((state) => state.actions);
// #endregion
