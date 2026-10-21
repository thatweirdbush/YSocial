import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { ExcludedAuthors, ExclusionReason, FeedTab, IncomingBuffer, OwnerOp, PostItem, RemovalSnapshot } from "../types";

// Normalized client cache of posts. Every screen reads the same entity via usePost(id),
// so like/bookmark/reply changes are reflected everywhere in O(1).

/** Max posts kept in the new-post buffer; older entries drop and turn the pill into "20+". */
export const INCOMING_CAP = 20;

const FEED_TABS: readonly FeedTab[] = ["forYou", "following"];

/** Paging state lives in the store (not the feed component) so a remounted feed reuses loaded pages. */
export interface FeedMeta {
  loaded: boolean;
  nextPage?: number;
}

interface PostStoreData extends IncomingBuffer {
  posts: Record<string, PostItem>;
  replyIds: Record<string, string[]>;
  feedIds: Record<FeedTab, string[]>;
  feedMeta: Record<FeedTab, FeedMeta>;
  /** Tombstones: deleted ids never re-enter the cache (lists holding their own props hide them too). */
  deletedIds: Record<string, true>;
  /** authorId -> pinned root post id; invariant: points at the only cached post of that author with isPinned. */
  pinnedIdByAuthor: Record<string, string>;
  /** At most 1 pending owner mutation per post. */
  ownerOpById: Record<string, OwnerOp>;
  /** Authors hidden from this viewer's lists, with every active reason (spec D20). */
  excludedAuthors: ExcludedAuthors;
}

interface PostStoreActions {
  upsertPosts: (posts: PostItem[]) => void;
  /**
   * Appending skips ids already cached (offset pages shift after prependPost). A page-1 load (`append` false)
   * also consumes the buffered posts it contains and clears the tab's overflow.
   */
  setFeedPage: (tab: FeedTab, ids: string[], append: boolean, nextPage?: number) => void;
  setReplies: (parentId: string, ids: string[]) => void;
  /** `seed` inserts the post first when it is not cached yet (e.g. Saved page items). */
  toggleLike: (id: string, seed?: PostItem) => void;
  toggleBookmark: (id: string, seed?: PostItem) => void;
  addReply: (parentId: string, reply: PostItem) => void;
  removeReply: (parentId: string, replyId: string) => void;
  prependPost: (tab: FeedTab, post: PostItem) => void;
  /** Buffers a pushed post; never touches the visible feeds (no layout shift). */
  bufferIncoming: (post: PostItem) => void;
  /** Merges `ids` (the tab's pending posts) on top of the feed and consumes them for that tab only. */
  flushPending: (tab: FeedTab, ids: string[]) => void;
  /** Marks buffered ids as covered by `tab` (e.g. after a page-1 refetch) and clears its overflow. */
  consumeIncoming: (tab: FeedTab, ids: string[]) => void;
  /** Optimistic delete of a post & its cached reply tree; null when the post is not cached. */
  removePost: (id: string) => RemovalSnapshot | null;
  /** Reconciles with the service result: tombstones every id (cached or not) and drops cached remnants. */
  markDeleted: (ids: string[]) => void;
  /** Rollback of `removePost`; idempotent. */
  restorePosts: (snapshot: RemovalSnapshot) => void;
  /** Takes the post's owner-op lock; false when another op is pending. */
  beginOwnerOp: (id: string, op: OwnerOp) => boolean;
  endOwnerOp: (id: string) => void;
  editPost: (id: string, content: string) => void;
  /** Pins/unpins in one update (target, previous pin & index); returns the id it unpinned. */
  setPinned: (id: string, pinned: boolean) => string | undefined;
  setHideLikeCount: (id: string, hidden: boolean) => void;
  /** Field-scoped rollback: applies `patch` only while every `expected` field is unchanged (empty -> always). */
  patchPostIf: (id: string, expected: Partial<PostItem>, patch: Partial<PostItem>) => void;
  /** Adds `reason` for the author and removes their posts from both feeds & the buffer (replies too when blocked). */
  excludeAuthor: (authorId: string, reason: ExclusionReason) => void;
  /** Lifts ONLY `reason`; removed ids are never restored (the next page-1 load brings them back). */
  includeAuthor: (authorId: string, reason: ExclusionReason) => void;
  /** Replaces the whole exclusion map (relation sets load) and purges what it excludes. */
  setExcludedAuthors: (excluded: ExcludedAuthors) => void;
  /** Viewer switch: clears feeds, paging, buffer & exclusions; cached posts stay (spec D25). */
  resetViewerFeeds: () => void;
  /** Viewer switch: the previous viewer's like & bookmark flags must not stay on cached posts (nothing else changes). */
  resetViewerFlags: () => void;
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
  incoming: [],
  consumedIncoming: { forYou: {}, following: {} },
  droppedAuthorIds: { forYou: [], following: [] },
  deletedIds: {},
  pinnedIdByAuthor: {},
  ownerOpById: {},
  excludedAuthors: {},
});

/** The part of the initial state that depends on who the viewer is. */
const viewerFeedData = (): Pick<
  PostStoreData,
  "feedIds" | "feedMeta" | "incoming" | "consumedIncoming" | "droppedAuthorIds" | "excludedAuthors"
> => {
  const { feedIds, feedMeta, incoming, consumedIncoming, droppedAuthorIds, excludedAuthors } = initialData();
  return { feedIds, feedMeta, incoming, consumedIncoming, droppedAuthorIds, excludedAuthors };
};

// #region Helpers
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

function withConsumed(
  consumed: IncomingBuffer["consumedIncoming"],
  tab: FeedTab,
  ids: readonly string[],
): IncomingBuffer["consumedIncoming"] {
  if (ids.length === 0) return consumed;
  const next = { ...consumed[tab] };
  for (const id of ids) next[id] = true;
  return { ...consumed, [tab]: next };
}

/** Drops `ids` from every tab's consumed map (they left the buffer). */
function withoutConsumed(consumed: IncomingBuffer["consumedIncoming"], ids: ReadonlySet<string>) {
  const next = { ...consumed };
  for (const tab of FEED_TABS) {
    if (!Object.keys(consumed[tab]).some((id) => ids.has(id))) continue;
    const map = { ...consumed[tab] };
    for (const id of ids) delete map[id];
    next[tab] = map;
  }
  return next;
}

/** Ids of `rootId` and its cached reply tree, preorder (root first). */
function collectSubtree(replyIds: Record<string, string[]>, rootId: string): string[] {
  const ids: string[] = [];
  const visit = (id: string) => {
    ids.push(id);
    for (const child of replyIds[id] ?? EMPTY_IDS) visit(child);
  };
  visit(rootId);
  return ids;
}

/**
 * Keeps the pin index in sync with posts that just entered the cache: a pinned arrival unpins the author's
 * other cached pin; an unpinned arrival that the index points at clears the entry. Mutates `posts`.
 */
function reindexPins(
  posts: Record<string, PostItem>,
  index: Record<string, string>,
  changed: readonly PostItem[],
): Record<string, string> {
  let next = index;
  for (const post of changed) {
    const authorId = post.user.id;
    const current = next[authorId];
    if (post.isPinned) {
      if (current === post.id) continue;
      if (current && posts[current]) posts[current] = { ...posts[current], isPinned: false };
      next = { ...next, [authorId]: post.id };
    } else if (current === post.id) {
      next = { ...next };
      delete next[authorId];
    }
  }
  return next;
}

/** Removes `ids` from every list in the store; returns only the changed slices. */
function purge(state: PostStoreData, ids: ReadonlySet<string>): Partial<PostStoreData> {
  const posts = { ...state.posts };
  for (const id of ids) delete posts[id];

  const feedIds = { ...state.feedIds };
  for (const tab of FEED_TABS) {
    if (state.feedIds[tab].some((id) => ids.has(id))) feedIds[tab] = state.feedIds[tab].filter((id) => !ids.has(id));
  }

  const replyIds: Record<string, string[]> = {};
  for (const [parentId, children] of Object.entries(state.replyIds)) {
    if (ids.has(parentId)) continue;
    replyIds[parentId] = children.some((id) => ids.has(id)) ? children.filter((id) => !ids.has(id)) : children;
  }

  const deletedIds = { ...state.deletedIds };
  for (const id of ids) deletedIds[id] = true;

  const pinnedIdByAuthor = Object.fromEntries(Object.entries(state.pinnedIdByAuthor).filter(([, id]) => !ids.has(id)));

  return {
    posts,
    feedIds,
    replyIds,
    pinnedIdByAuthor,
    incoming: state.incoming.some((id) => ids.has(id)) ? state.incoming.filter((id) => !ids.has(id)) : state.incoming,
    consumedIncoming: withoutConsumed(state.consumedIncoming, ids),
    deletedIds,
  };
}

const isExcluded = (excluded: ExcludedAuthors, authorId: string | undefined): boolean =>
  authorId !== undefined && excluded[authorId] !== undefined;

const isBlockedAuthor = (excluded: ExcludedAuthors, authorId: string | undefined): boolean =>
  authorId !== undefined && excluded[authorId]?.blocked === true;

/**
 * Removes excluded authors' posts from both feeds and the buffer, and blocked authors' replies from reply lists.
 * Returns only the changed slices; cached posts stay (profile, thread & search still need them).
 */
function dropExcluded(state: PostStoreData, excluded: ExcludedAuthors): Partial<PostStoreData> {
  const authorOf = (id: string) => state.posts[id]?.user.id;

  const feedIds = { ...state.feedIds };
  for (const tab of FEED_TABS) {
    if (state.feedIds[tab].some((id) => isExcluded(excluded, authorOf(id)))) {
      feedIds[tab] = state.feedIds[tab].filter((id) => !isExcluded(excluded, authorOf(id)));
    }
  }

  const removedIncoming = new Set(state.incoming.filter((id) => isExcluded(excluded, authorOf(id))));
  const incoming = removedIncoming.size > 0 ? state.incoming.filter((id) => !removedIncoming.has(id)) : state.incoming;

  const replyIds: Record<string, string[]> = {};
  for (const [parentId, children] of Object.entries(state.replyIds)) {
    replyIds[parentId] = children.some((id) => isBlockedAuthor(excluded, authorOf(id)))
      ? children.filter((id) => !isBlockedAuthor(excluded, authorOf(id)))
      : children;
  }

  const droppedAuthorIds = { ...state.droppedAuthorIds };
  for (const tab of FEED_TABS) {
    if (state.droppedAuthorIds[tab].some((id) => isExcluded(excluded, id))) {
      droppedAuthorIds[tab] = state.droppedAuthorIds[tab].filter((id) => !isExcluded(excluded, id));
    }
  }

  return {
    feedIds,
    incoming,
    replyIds,
    droppedAuthorIds,
    consumedIncoming: removedIncoming.size > 0 ? withoutConsumed(state.consumedIncoming, removedIncoming) : state.consumedIncoming,
  };
}

/** Inserts `id` at `index` (clamped) unless already present. */
function insertAt(list: string[], id: string, index: number): string[] {
  if (index < 0 || list.includes(id)) return list;
  const next = [...list];
  next.splice(Math.min(index, next.length), 0, id);
  return next;
}
// #endregion

export const usePostStore = create<PostStoreState>((set, get) => ({
  ...initialData(),
  actions: {
    upsertPosts: (posts) =>
      set((state) => {
        const next = { ...state.posts };
        const alive = posts.filter((post) => !state.deletedIds[post.id]);
        for (const post of alive) next[post.id] = post;
        return { posts: next, pinnedIdByAuthor: reindexPins(next, state.pinnedIdByAuthor, alive) };
      }),

    setFeedPage: (tab, ids, append, nextPage) =>
      set((state) => {
        const alive = ids.filter((id) => !state.deletedIds[id] && !isExcluded(state.excludedAuthors, state.posts[id]?.user.id));
        let nextIds = alive;
        if (append) {
          const cached = new Set(state.feedIds[tab]);
          nextIds = [...state.feedIds[tab], ...alive.filter((id) => !cached.has(id))];
        }
        const update: Partial<PostStoreData> = {
          feedIds: { ...state.feedIds, [tab]: nextIds },
          feedMeta: { ...state.feedMeta, [tab]: { loaded: true, nextPage } },
        };
        if (!append) {
          const page = new Set(alive);
          update.consumedIncoming = withConsumed(state.consumedIncoming, tab, state.incoming.filter((id) => page.has(id)));
          update.droppedAuthorIds = { ...state.droppedAuthorIds, [tab]: [] };
        }
        return update;
      }),

    setReplies: (parentId, ids) =>
      set((state) => ({
        replyIds: {
          ...state.replyIds,
          [parentId]: ids.filter((id) => !state.deletedIds[id] && !isBlockedAuthor(state.excludedAuthors, state.posts[id]?.user.id)),
        },
      })),

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
          pinnedIdByAuthor: reindexPins(posts, state.pinnedIdByAuthor, [reply]),
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
      set((state) => {
        const posts = { ...state.posts, [post.id]: post };
        return {
          posts,
          pinnedIdByAuthor: reindexPins(posts, state.pinnedIdByAuthor, [post]),
          feedIds: { ...state.feedIds, [tab]: [post.id, ...state.feedIds[tab].filter((id) => id !== post.id)] },
        };
      }),

    bufferIncoming: (post) =>
      set((state) => {
        if (state.deletedIds[post.id] || state.incoming.includes(post.id) || isExcluded(state.excludedAuthors, post.user.id)) return state;
        const inFeeds = FEED_TABS.filter((tab) => state.feedIds[tab].includes(post.id));
        if (inFeeds.length === FEED_TABS.length) return state;

        let consumedIncoming = state.consumedIncoming;
        for (const tab of inFeeds) consumedIncoming = withConsumed(consumedIncoming, tab, [post.id]);
        const posts = { ...state.posts, [post.id]: post };
        const pinnedIdByAuthor = reindexPins(posts, state.pinnedIdByAuthor, [post]);
        let incoming = [post.id, ...state.incoming];
        let droppedAuthorIds = state.droppedAuthorIds;

        if (incoming.length > INCOMING_CAP) {
          const dropped = incoming[incoming.length - 1];
          incoming = incoming.slice(0, INCOMING_CAP);
          const authorId = posts[dropped]?.user.id;
          if (authorId) {
            droppedAuthorIds = { ...droppedAuthorIds };
            for (const tab of FEED_TABS) {
              if (!consumedIncoming[tab][dropped] && !droppedAuthorIds[tab].includes(authorId)) {
                droppedAuthorIds[tab] = [...droppedAuthorIds[tab], authorId];
              }
            }
          }
          consumedIncoming = withoutConsumed(consumedIncoming, new Set([dropped]));
        }
        return { posts, pinnedIdByAuthor, incoming, consumedIncoming, droppedAuthorIds };
      }),

    flushPending: (tab, ids) =>
      set((state) => {
        const current = new Set(state.feedIds[tab]);
        const fresh = ids.filter((id) => !current.has(id) && !state.deletedIds[id]);
        return {
          feedIds: { ...state.feedIds, [tab]: [...fresh, ...state.feedIds[tab]] },
          consumedIncoming: withConsumed(state.consumedIncoming, tab, ids),
          droppedAuthorIds: { ...state.droppedAuthorIds, [tab]: [] },
        };
      }),

    consumeIncoming: (tab, ids) =>
      set((state) => ({
        consumedIncoming: withConsumed(state.consumedIncoming, tab, ids.filter((id) => state.incoming.includes(id))),
        droppedAuthorIds: { ...state.droppedAuthorIds, [tab]: [] },
      })),

    removePost: (id) => {
      const state = get();
      const root = state.posts[id];
      if (!root) return null;

      const subtree = collectSubtree(state.replyIds, id);
      const parentId = root.parentId;
      const parent = parentId ? state.posts[parentId] : undefined;
      const feedIndex: RemovalSnapshot["feedIndex"] = {};
      for (const tab of FEED_TABS) {
        const index = state.feedIds[tab].indexOf(id);
        if (index >= 0) feedIndex[tab] = index;
      }
      const replyIds: Record<string, string[]> = {};
      for (const removed of subtree) {
        if (state.replyIds[removed]) replyIds[removed] = state.replyIds[removed];
      }
      const snapshot: RemovalSnapshot = {
        posts: subtree.map((removed) => state.posts[removed]).filter((post): post is PostItem => post !== undefined),
        feedIndex,
        incomingIndex: state.incoming.indexOf(id),
        consumedTabs: FEED_TABS.filter((tab) => state.consumedIncoming[tab][id]),
        parentId,
        replyIndex: parentId ? (state.replyIds[parentId] ?? EMPTY_IDS).indexOf(id) : -1,
        replyIds,
        parentDecremented: parent !== undefined,
        wasPinned: root.isPinned === true,
      };

      set((current) => {
        const update = purge(current, new Set(subtree));
        if (parentId && update.posts?.[parentId]) {
          const parentPost = update.posts[parentId];
          update.posts[parentId] = { ...parentPost, commentsCount: Math.max(0, parentPost.commentsCount - 1) };
        }
        return update;
      });
      return snapshot;
    },

    markDeleted: (ids) =>
      set((state) => {
        const known = (id: string) =>
          state.posts[id] !== undefined || state.replyIds[id] !== undefined || state.incoming.includes(id);
        if (ids.every((id) => state.deletedIds[id] && !known(id))) return state;
        return purge(state, new Set(ids));
      }),

    restorePosts: (snapshot) =>
      set((state) => {
        const [root] = snapshot.posts;
        if (!root) return state;

        const rootAdded = state.posts[root.id] === undefined;
        const posts = { ...state.posts };
        for (const post of snapshot.posts) posts[post.id] ??= post;
        if (rootAdded && snapshot.parentDecremented && snapshot.parentId && posts[snapshot.parentId]) {
          const parent = posts[snapshot.parentId];
          posts[snapshot.parentId] = { ...parent, commentsCount: parent.commentsCount + 1 };
        }

        const feedIds = { ...state.feedIds };
        for (const tab of FEED_TABS) {
          const index = snapshot.feedIndex[tab];
          if (index !== undefined) feedIds[tab] = insertAt(feedIds[tab], root.id, index);
        }

        const replyIds = { ...state.replyIds };
        for (const [parentId, children] of Object.entries(snapshot.replyIds)) replyIds[parentId] ??= children;
        if (snapshot.parentId && replyIds[snapshot.parentId]) {
          replyIds[snapshot.parentId] = insertAt(replyIds[snapshot.parentId], root.id, snapshot.replyIndex);
        }

        let consumedIncoming = state.consumedIncoming;
        for (const tab of snapshot.consumedTabs) consumedIncoming = withConsumed(consumedIncoming, tab, [root.id]);

        const deletedIds = { ...state.deletedIds };
        for (const post of snapshot.posts) delete deletedIds[post.id];

        // A pin the author made while the delete was pending wins; the restored post comes back unpinned
        const pinnedMeanwhile = snapshot.wasPinned ? state.pinnedIdByAuthor[root.user.id] : undefined;
        if (pinnedMeanwhile !== undefined && pinnedMeanwhile !== root.id) posts[root.id] = { ...posts[root.id], isPinned: false };
        const pinnedIdByAuthor = snapshot.wasPinned && posts[root.id].isPinned
          ? reindexPins(posts, state.pinnedIdByAuthor, [posts[root.id]])
          : state.pinnedIdByAuthor;

        return {
          posts,
          pinnedIdByAuthor,
          feedIds,
          replyIds,
          incoming: insertAt(state.incoming, root.id, snapshot.incomingIndex),
          consumedIncoming,
          deletedIds,
        };
      }),

    beginOwnerOp: (id, op) => {
      if (get().ownerOpById[id]) return false;
      set((state) => ({ ownerOpById: { ...state.ownerOpById, [id]: op } }));
      return true;
    },

    endOwnerOp: (id) =>
      set((state) => {
        if (!state.ownerOpById[id]) return state;
        const ownerOpById = { ...state.ownerOpById };
        delete ownerOpById[id];
        return { ownerOpById };
      }),

    editPost: (id, content) =>
      set((state) => {
        const posts = updatePost(state.posts, id, undefined, (post) => ({ ...post, content, isEdited: true }));
        return posts ? { posts } : state;
      }),

    setPinned: (id, pinned) => {
      const { posts: current, pinnedIdByAuthor } = get();
      const post = current[id];
      if (!post) return undefined;
      const previous = pinnedIdByAuthor[post.user.id];
      const unpinned = pinned && previous !== undefined && previous !== id ? previous : undefined;

      set((state) => {
        const posts = { ...state.posts, [id]: { ...post, isPinned: pinned } };
        return { posts, pinnedIdByAuthor: reindexPins(posts, state.pinnedIdByAuthor, [posts[id]]) };
      });
      return unpinned;
    },

    setHideLikeCount: (id, hidden) =>
      set((state) => {
        const posts = updatePost(state.posts, id, undefined, (post) => ({ ...post, hideLikeCount: hidden }));
        return posts ? { posts } : state;
      }),

    patchPostIf: (id, expected, patch) =>
      set((state) => {
        const post = state.posts[id];
        if (!post) return state;
        const matches = (Object.keys(expected) as (keyof PostItem)[]).every((key) => Object.is(post[key], expected[key]));
        return matches ? { posts: { ...state.posts, [id]: { ...post, ...patch } } } : state;
      }),

    excludeAuthor: (authorId, reason) =>
      set((state) => {
        const excludedAuthors = { ...state.excludedAuthors, [authorId]: { ...state.excludedAuthors[authorId], [reason]: true as const } };
        return { excludedAuthors, ...dropExcluded(state, excludedAuthors) };
      }),

    includeAuthor: (authorId, reason) =>
      set((state) => {
        const current = state.excludedAuthors[authorId];
        if (!current?.[reason]) return state;
        const rest = { ...current };
        delete rest[reason];
        const excludedAuthors = { ...state.excludedAuthors };
        if (Object.keys(rest).length === 0) delete excludedAuthors[authorId];
        else excludedAuthors[authorId] = rest;
        return { excludedAuthors };
      }),

    setExcludedAuthors: (excludedAuthors) => set((state) => ({ excludedAuthors, ...dropExcluded(state, excludedAuthors) })),

    resetViewerFeeds: () => set(viewerFeedData()),

    resetViewerFlags: () =>
      set((state) => ({
        posts: Object.fromEntries(
          Object.entries(state.posts).map(([id, post]) => [
            id,
            post.isLikedByCurrentUser || post.isBookmarkedByCurrentUser
              ? { ...post, isLikedByCurrentUser: false, isBookmarkedByCurrentUser: false }
              : post,
          ]),
        ),
      })),
  },
}));

/** Non-hook access to the actions for event handlers & other stores (call time only). */
export const getPostActions = (): PostStoreActions => usePostStore.getState().actions;

/** Test-only: clear cached data, keep actions. */
export const resetPostStore = () => usePostStore.setState(initialData());

// #region Selectors
export const usePost = (id: string) => usePostStore((state) => state.posts[id]);
/** Author id only: re-renders just when the cached author changes, not on every post update. */
export const usePostAuthorId = (id: string): string | undefined => usePostStore((state) => state.posts[id]?.user.id);
export const useReplyIds = (parentId: string) =>
  usePostStore((state) => state.replyIds[parentId] ?? EMPTY_IDS);
export const useFeedIds = (tab: FeedTab) => usePostStore((state) => state.feedIds[tab]);
export const useFeedMeta = (tab: FeedTab) => usePostStore((state) => state.feedMeta[tab]);
export const useIncomingBuffer = (): IncomingBuffer =>
  usePostStore(
    useShallow((state) => ({
      incoming: state.incoming,
      consumedIncoming: state.consumedIncoming,
      droppedAuthorIds: state.droppedAuthorIds,
    })),
  );
/** Id of the author's pinned root post among cached posts (live reorder after pin/unpin). */
export const usePinnedPostId = (authorId: string): string | undefined => usePostStore((state) => state.pinnedIdByAuthor[authorId]);
export const useIsDeleted = (id: string) => usePostStore((state) => state.deletedIds[id] === true);
export const useOwnerOp = (id: string): OwnerOp | undefined => usePostStore((state) => state.ownerOpById[id]);
/** The viewer blocked the author or the author blocked the viewer (cards render nothing). */
export const useIsAuthorBlocked = (authorId: string): boolean => usePostStore((state) => state.excludedAuthors[authorId]?.blocked === true);
export const usePostActions = () => usePostStore((state) => state.actions);
// #endregion
