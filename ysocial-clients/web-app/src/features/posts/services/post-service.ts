import { ForbiddenError } from "@/lib/errors";
import { normalizeText, tokenize } from "@/lib/text";
import { isPrivate } from "@/mocks/privacy";
import { getFollowedIds } from "@/mocks/relation-graph";
import { SEED_AUTHORS } from "@/mocks/seed-authors";
import { asViewer, canViewPost, canViewProfile, isMutedBy } from "@/mocks/visibility";
import { MOCK_INCOMING_CONTENTS } from "../mocks/mock-incoming";
import { getMockPostById, MOCK_POSTS } from "../mocks/mock-posts";
import type {
  CreatePostInput,
  FeedPage,
  FeedTab,
  HashtagStat,
  ParentReference,
  PostAuthor,
  PostItem,
  PostRef,
  PostSearchSort,
  PostThread,
  SavedPostsPage,
  TagPage,
  TagSort,
  UserPostsPage,
  UserPostsTab,
} from "../types";
import { getPostFeedTabs } from "../utils/feed-tabs";
import { byNewest, collectTagStats, hasTag, tagKey } from "../utils/hashtags";
import { POST_CONTENT_MAX } from "../utils/post-content";

// Mock data source for posts. Replace the bodies with real API calls when the backend is wired;
// callers (containers + post-store) stay unchanged.

export const FEED_PAGE_SIZE = 10;

/** Page size of every profile tab (threads / replies / media / saved). */
export const PROFILE_PAGE_SIZE = 10;

/** Max results per search / tag query (no paging yet). */
export const SEARCH_LIMIT = 50;

/** Simulated push cadence: one tick every 45s ±10s, 1-2 posts per tick. */
export const NEW_POST_INTERVAL_MS = 45_000;
export const NEW_POST_JITTER_MS = 10_000;

/** Dev-only: probability (0–1) that a call rejects, to exercise error UI by hand. */
const MOCK_FAILURE_RATE = 0;

export { ForbiddenError };

type NewPostListener = (post: PostItem) => void;

let db = new Map<string, PostItem>();
let idCounter = 0;
let listeners = new Set<NewPostListener>();
let streamTimer: ReturnType<typeof setTimeout> | undefined;

/** Test-only: restore seed data and stop the new-post stream (listeners, timer, id counter). */
export function __resetMockDb(): void {
  db = new Map(MOCK_POSTS.map((post) => [post.id, structuredClone(post)]));
  idCounter = 0;
  listeners = new Set();
  clearTimeout(streamTimer);
  streamTimer = undefined;
}
__resetMockDb();

/** Test-only: removes exactly one post (no subtree), to simulate a parent that was soft-deleted server-side. */
export function __removePostOnly(id: string): void {
  db.delete(id);
}

// #region Helpers
function mockDelay(): Promise<void> {
  const ms = 300 + Math.random() * 300;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulateNetwork(): Promise<void> {
  await mockDelay();
  if (MOCK_FAILURE_RATE > 0 && Math.random() < MOCK_FAILURE_RATE) {
    throw new Error("Mock network failure");
  }
}

const copy = (post: PostItem): PostItem => structuredClone(post);

/**
 * Whether `viewer` may see `post`: the visibility contract (`mocks/visibility`) plus thread rules. A reply carries
 * no visibility of its own, so it is visible only if its nearest existing root is visible and its author passes.
 */
function visibleTo(viewer: string | null, post: PostItem): boolean {
  if (!canViewPost(viewer, post)) return false;
  let root = post;
  for (let parent = db.get(root.parentId ?? ""); parent; parent = db.get(root.parentId ?? "")) root = parent;
  return root === post || canViewPost(viewer, root);
}

/** True when a signed-out visitor could see `post` and its seed thread root (server metadata must not leak more). */
export function isPostPubliclyVisible(post: Pick<PostItem, "user" | "visibility" | "parentId">): boolean {
  if (!canViewPost(null, post)) return false;
  const parent = post.parentId ? getMockPostById(post.parentId) : undefined;
  return parent ? isPostPubliclyVisible(parent) : true;
}

const roots = (): PostItem[] => [...db.values()].filter((post) => post.parentId === undefined);

function countOccurrences(text: string, token: string): number {
  let count = 0;
  for (let from = text.indexOf(token); from !== -1; from = text.indexOf(token, from + token.length)) count += 1;
  return count;
}

/** Relevance score; null when any token is missing. Author-name hits weigh 2x. */
function scorePost(post: PostItem, tokens: string[]): number | null {
  const content = normalizeText(post.content);
  const author = normalizeText(`${post.user.displayName} ${post.user.username}`);
  let score = 0;
  for (const token of tokens) {
    const inContent = countOccurrences(content, token);
    const inAuthor = author.includes(token);
    if (inContent === 0 && !inAuthor) return null;
    score += inContent + (inAuthor ? 2 : 0);
  }
  return score;
}

function childrenOf(parentId: string): PostItem[] {
  return Array.from(db.values())
    .filter((post) => post.parentId === parentId)
    .sort(byNewest);
}

/** Existing post owned by `actorId`; ownership is the mock backend's rule, not just UI visibility. */
function ownedPost(id: string, actorId: string): PostItem {
  const post = db.get(id);
  if (!post) throw new Error(`Post ${id} not found`);
  if (post.user.id !== actorId) throw new ForbiddenError(`Post ${id} is not owned by ${actorId}`);
  return post;
}

function descendantIds(id: string): string[] {
  const ids: string[] = [];
  for (const child of childrenOf(id)) ids.push(child.id, ...descendantIds(child.id));
  return ids;
}

const pick = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function buildPost(input: CreatePostInput, author: PostAuthor, parent?: Pick<PostRef, "id" | "rootPostId">, prefix = "post-local"): PostItem {
  idCounter += 1;
  const id = `${prefix}-${Date.now()}-${idCounter}`;
  const parentId = parent?.id;
  return {
    id,
    kind: parent ? "comment" : "post",
    rootPostId: parent ? parent.rootPostId : id,
    content: input.content,
    imageUrls: input.images.length > 0 ? [...input.images] : undefined,
    createdAt: new Date().toISOString(),
    likesCount: 0,
    commentsCount: 0,
    isLikedByCurrentUser: false,
    isBookmarkedByCurrentUser: false,
    user: { ...author },
    parentId,
    ...(parentId === undefined && input.visibility === "closeFriends" ? { visibility: "closeFriends" as const } : {}),
  };
}
// #endregion

export async function fetchFeed(tab: FeedTab, page: number, viewerId: string): Promise<FeedPage> {
  await simulateNetwork();

  const followed = getFollowedIds(viewerId);
  const viewer = asViewer(viewerId);
  const roots = [...db.values()]
    .filter((post) => getPostFeedTabs(post, followed).includes(tab) && visibleTo(viewer, post) && !isMutedBy(viewer, post.user.id))
    .sort(byNewest);

  const start = (page - 1) * FEED_PAGE_SIZE;
  const posts = roots.slice(start, start + FEED_PAGE_SIZE).map(copy);
  const nextPage = start + FEED_PAGE_SIZE < roots.length ? page + 1 : undefined;
  return { posts, nextPage };
}

const hasImages = (post: PostItem): boolean => post.imageUrl !== undefined || (post.imageUrls?.length ?? 0) > 0;

function pageOf<T>(items: T[], page: number): { items: T[]; nextPage?: number } {
  const start = (page - 1) * PROFILE_PAGE_SIZE;
  return { items: items.slice(start, start + PROFILE_PAGE_SIZE), nextPage: start + PROFILE_PAGE_SIZE < items.length ? page + 1 : undefined };
}

/**
 * One author's posts per profile tab, newest first. `threads`: roots, the pinned one first (so it is never
 * repeated on later pages); `replies`: replies plus their parent references; `media`: roots with images.
 */
export async function fetchUserPosts(userId: string, tab: UserPostsTab, page: number, actorId: string): Promise<UserPostsPage> {
  await simulateNetwork();

  const viewer = asViewer(actorId);
  if (!canViewProfile(viewer, userId)) return { posts: [], parents: [], locked: true };

  const own = [...db.values()].filter((post) => post.user.id === userId && visibleTo(viewer, post)).sort(byNewest);
  let list: PostItem[];
  switch (tab) {
    case "threads": {
      const threads = own.filter((post) => post.parentId === undefined);
      const pinned = threads.find((post) => post.isPinned);
      list = pinned ? [pinned, ...threads.filter((post) => post !== pinned)] : threads;
      break;
    }
    case "replies":
      list = own.filter((post) => post.parentId !== undefined);
      break;
    case "media":
      list = own.filter((post) => post.parentId === undefined && hasImages(post));
      break;
  }

  const { items, nextPage } = pageOf(list, page);
  const parents: ParentReference[] = [];
  if (tab === "replies") {
    for (const reply of items) {
      const parentId = reply.parentId as string;
      if (parents.some((parent) => parent.id === parentId)) continue;
      const parent = db.get(parentId);
      parents.push(parent ? { id: parentId, author: { ...parent.user }, deleted: false } : { id: parentId, deleted: true });
    }
  }
  return { posts: items.map(copy), parents, nextPage, locked: false };
}

/**
 * Posts the viewer bookmarked (roots and replies) and may still see, newest first. The bookmark flag is currently
 * global on the post (tracked debt); `actorId` drives visibility only.
 */
export async function fetchSavedPosts(actorId: string, page: number): Promise<SavedPostsPage> {
  await simulateNetwork();

  const viewer = asViewer(actorId);
  const saved = [...db.values()].filter((post) => post.isBookmarkedByCurrentUser && visibleTo(viewer, post)).sort(byNewest);
  const { items, nextPage } = pageOf(saved, page);
  return { posts: items.map(copy), nextPage };
}

/** Not-found (`null`) when the viewer cannot see the post; replies the viewer cannot see are filtered out. */
export async function fetchPostThread(id: string, actorId: string): Promise<PostThread | null> {
  await simulateNetwork();

  const viewer = asViewer(actorId);
  const post = db.get(id);
  if (!post || !visibleTo(viewer, post)) return null;

  const replies = childrenOf(id).filter((reply) => visibleTo(viewer, reply));
  const childReplies: Record<string, PostItem[]> = {};
  for (const reply of replies) {
    childReplies[reply.id] = childrenOf(reply.id)
      .filter((child) => visibleTo(viewer, child))
      .map(copy);
  }

  const candidate = post.parentId ? db.get(post.parentId) : undefined;
  const parent = candidate && visibleTo(viewer, candidate) ? candidate : undefined;
  return {
    post: copy(post),
    parent: parent && copy(parent),
    replies: replies.map(copy),
    childReplies,
  };
}

export async function createPost(input: CreatePostInput, author: PostAuthor): Promise<PostItem> {
  await simulateNetwork();

  const post = buildPost(input, author);
  db.set(post.id, post);
  return copy(post);
}

/**
 * Persists the like state (idempotent set, not toggle) so refetches don't clobber optimistic UI.
 * Applied before the simulated latency, like a server that commits on receipt; unknown ids are ignored.
 */
export async function setPostLike(ref: PostRef, liked: boolean): Promise<void> {
  const post = db.get(ref.id);
  if (post && post.isLikedByCurrentUser !== liked) {
    post.isLikedByCurrentUser = liked;
    post.likesCount = Math.max(0, post.likesCount + (liked ? 1 : -1));
  }
  await mockDelay();
}

export async function setPostBookmark(ref: PostRef, bookmarked: boolean): Promise<void> {
  const post = db.get(ref.id);
  if (post) post.isBookmarkedByCurrentUser = bookmarked;
  await mockDelay();
}

export async function createReply(parentRef: PostRef, input: CreatePostInput, author: PostAuthor): Promise<PostItem> {
  await simulateNetwork();

  const parent = db.get(parentRef.id);
  if (!parent) throw new Error(`Post ${parentRef.id} not found`);

  const reply = buildPost(input, author, parentRef);
  db.set(reply.id, reply);
  parent.commentsCount += 1;
  return copy(reply);
}

/**
 * Root posts matching every token. `relevance`: score, likes, newest; `latest`: newest first.
 * `#tag` query -> exact tag match (relevance = likes, newest).
 */
export async function searchPosts(
  query: string,
  actorId: string,
  limit = SEARCH_LIMIT,
  sort: PostSearchSort = "relevance",
): Promise<PostItem[]> {
  await simulateNetwork();

  const viewer = asViewer(actorId);
  const visibleRoots = () => roots().filter((post) => visibleTo(viewer, post));

  const trimmed = query.trim();
  if (trimmed.startsWith("#")) {
    const key = tagKey(trimmed);
    if (!key) return [];
    return visibleRoots()
      .filter((post) => hasTag(post, key))
      .sort(sort === "latest" ? byNewest : (a, b) => b.likesCount - a.likesCount || byNewest(a, b))
      .slice(0, limit)
      .map(copy);
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return [];

  return visibleRoots()
    .map((post) => ({ post, score: scorePost(post, tokens) }))
    .filter((entry): entry is { post: PostItem; score: number } => entry.score !== null)
    .sort((a, b) =>
      sort === "latest"
        ? byNewest(a.post, b.post)
        : b.score - a.score || b.post.likesCount - a.post.likesCount || byNewest(a.post, b.post),
    )
    .slice(0, limit)
    .map((entry) => copy(entry.post));
}

export async function fetchPostsByTag(tag: string, sort: TagSort, actorId: string): Promise<TagPage> {
  await simulateNetwork();

  const viewer = asViewer(actorId);
  const key = tagKey(tag);
  const matches = roots().filter((post) => hasTag(post, key) && visibleTo(viewer, post));
  if (matches.length === 0) return { tag, postsCount: 0, posts: [] };

  const order = sort === "top" ? (a: PostItem, b: PostItem) => b.likesCount - a.likesCount || byNewest(a, b) : byNewest;
  const stat = collectTagStats(matches).get(key);
  return {
    tag: stat?.tag ?? tag,
    postsCount: matches.length,
    posts: matches.sort(order).slice(0, SEARCH_LIMIT).map(copy),
  };
}

/**
 * Most used tags over root posts a signed-out visitor can see (trending is global, so private authors' and close
 * friends posts never feed it): count desc, then normalized tag asc.
 */
export async function fetchTrendingTags(limit: number): Promise<HashtagStat[]> {
  await simulateNetwork();

  return [...collectTagStats([...db.values()].filter((post) => canViewPost(null, post)))]
    .sort(([keyA, a], [keyB, b]) => b.postsCount - a.postsCount || keyA.localeCompare(keyB))
    .slice(0, limit)
    .map(([, stat]) => stat);
}

// #region Owner mutations
export async function updatePostContent(ref: PostRef, content: string, actorId: string): Promise<PostItem> {
  await simulateNetwork();

  const post = ownedPost(ref.id, actorId);
  const next = content.trim();
  const hasImages = (post.imageUrls?.length ?? 0) > 0 || post.imageUrl !== undefined;
  if (next.length > POST_CONTENT_MAX || (next === "" && !hasImages)) throw new Error("Invalid post content");
  post.content = next;
  post.isEdited = true;
  return copy(post);
}

/** Deletes the post and its whole reply tree; returns every removed id. */
export async function deletePost(ref: PostRef, actorId: string): Promise<{ deletedIds: string[] }> {
  await simulateNetwork();

  const id = ref.id;
  const post = ownedPost(id, actorId);
  const deletedIds = [id, ...descendantIds(id)];
  for (const deletedId of deletedIds) db.delete(deletedId);
  const parent = post.parentId ? db.get(post.parentId) : undefined;
  if (parent) parent.commentsCount = Math.max(0, parent.commentsCount - 1);
  return { deletedIds };
}

/** Root posts only; pinning unpins the author's previously pinned post. */
export async function setPostPinned(id: string, pinned: boolean, actorId: string): Promise<PostItem> {
  await simulateNetwork();

  const post = ownedPost(id, actorId);
  if (post.parentId !== undefined) throw new Error("Only root posts can be pinned");
  if (pinned) {
    for (const other of db.values()) {
      if (other.isPinned && other.user.id === post.user.id) other.isPinned = false;
    }
  }
  post.isPinned = pinned;
  return copy(post);
}

export async function setHideLikeCount(id: string, hidden: boolean, actorId: string): Promise<PostItem> {
  await simulateNetwork();

  const post = ownedPost(id, actorId);
  post.hideLikeCount = hidden;
  return copy(post);
}
// #endregion

// #region New-post stream (SignalR-shaped)
function scheduleTick(): void {
  const delay = NEW_POST_INTERVAL_MS + Math.round((Math.random() * 2 - 1) * NEW_POST_JITTER_MS);
  streamTimer = setTimeout(() => {
    const count = Math.random() < 0.5 ? 1 : 2;
    for (let i = 0; i < count && listeners.size > 0; i += 1) {
      const input: CreatePostInput = { content: pick(MOCK_INCOMING_CONTENTS), images: [], audience: "anyone" };
      // The stream is global, not viewer-scoped: only public posts by public authors are generated
      const post = buildPost(input, pick(SEED_AUTHORS.filter((author) => !isPrivate(author.id))), undefined, "post-live");
      db.set(post.id, post);
      for (const listener of listeners) listener(copy(post));
    }
    // A listener may have unsubscribed the last one inside its callback: never leave an orphan timer chain
    if (listeners.size > 0) scheduleTick();
    else streamTimer = undefined;
  }, delay);
}

/**
 * Pushes posts by other authors as they are "published". One shared timer runs while at least one
 * listener is subscribed; the returned unsubscribe is idempotent. Swap for a SignalR `ReceiveNewPost` handler.
 */
export function subscribeToNewPosts(listener: NewPostListener): () => void {
  const wrapped: NewPostListener = (post) => listener(post);
  listeners.add(wrapped);
  if (listeners.size === 1) scheduleTick();

  return () => {
    if (!listeners.delete(wrapped)) return;
    if (listeners.size === 0) {
      clearTimeout(streamTimer);
      streamTimer = undefined;
    }
  };
}
// #endregion
