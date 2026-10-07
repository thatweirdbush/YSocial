import { normalizeText, tokenize } from "@/lib/text";
import { getFollowedAuthorIds } from "@/mocks/follow-graph";
import { SEED_AUTHORS } from "@/mocks/seed-authors";
import { MOCK_INCOMING_CONTENTS } from "../mocks/mock-incoming";
import { MOCK_POSTS } from "../mocks/mock-posts";
import type { CreatePostInput, FeedPage, FeedTab, HashtagStat, PostAuthor, PostItem, PostSearchSort, PostThread, TagPage, TagSort } from "../types";
import { getPostFeedTabs } from "../utils/feed-tabs";
import { byNewest, collectTagStats, hasTag, tagKey } from "../utils/hashtags";
import { POST_CONTENT_MAX } from "../utils/post-content";

// Mock data source for posts. Replace the bodies with real API calls when the backend is wired;
// callers (containers + post-store) stay unchanged.

export const FEED_PAGE_SIZE = 10;

/** Max results per search / tag query (no paging yet). */
export const SEARCH_LIMIT = 50;

/** Simulated push cadence: one tick every 45s ±10s, 1-2 posts per tick. */
export const NEW_POST_INTERVAL_MS = 45_000;
export const NEW_POST_JITTER_MS = 10_000;

/** Dev-only: probability (0–1) that a call rejects, to exercise error UI by hand. */
const MOCK_FAILURE_RATE = 0;

/** Rejection for an owner-only mutation attempted by someone else (backend 403). */
export class ForbiddenError extends Error {
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

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

function buildPost(input: CreatePostInput, author: PostAuthor, parentId?: string, prefix = "post-local"): PostItem {
  idCounter += 1;
  return {
    id: `${prefix}-${Date.now()}-${idCounter}`,
    content: input.content,
    imageUrls: input.images.length > 0 ? [...input.images] : undefined,
    createdAt: new Date().toISOString(),
    likesCount: 0,
    commentsCount: 0,
    isLikedByCurrentUser: false,
    isBookmarkedByCurrentUser: false,
    user: { ...author },
    parentId,
  };
}
// #endregion

export async function fetchFeed(tab: FeedTab, page: number, viewerId: string): Promise<FeedPage> {
  await simulateNetwork();

  const followed = getFollowedAuthorIds(viewerId);
  const roots = [...db.values()].filter((post) => getPostFeedTabs(post, followed).includes(tab)).sort(byNewest);

  const start = (page - 1) * FEED_PAGE_SIZE;
  const posts = roots.slice(start, start + FEED_PAGE_SIZE).map(copy);
  const nextPage = start + FEED_PAGE_SIZE < roots.length ? page + 1 : undefined;
  return { posts, nextPage };
}

export async function fetchPostThread(id: string): Promise<PostThread | null> {
  await simulateNetwork();

  const post = db.get(id);
  if (!post) return null;

  const replies = childrenOf(id);
  const childReplies: Record<string, PostItem[]> = {};
  for (const reply of replies) {
    childReplies[reply.id] = childrenOf(reply.id).map(copy);
  }

  const parent = post.parentId ? db.get(post.parentId) : undefined;
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
export async function setPostLike(id: string, liked: boolean): Promise<void> {
  const post = db.get(id);
  if (post && post.isLikedByCurrentUser !== liked) {
    post.isLikedByCurrentUser = liked;
    post.likesCount = Math.max(0, post.likesCount + (liked ? 1 : -1));
  }
  await mockDelay();
}

export async function setPostBookmark(id: string, bookmarked: boolean): Promise<void> {
  const post = db.get(id);
  if (post) post.isBookmarkedByCurrentUser = bookmarked;
  await mockDelay();
}

export async function createReply(parentId: string, input: CreatePostInput, author: PostAuthor): Promise<PostItem> {
  await simulateNetwork();

  const parent = db.get(parentId);
  if (!parent) throw new Error(`Post ${parentId} not found`);

  const reply = buildPost(input, author, parentId);
  db.set(reply.id, reply);
  parent.commentsCount += 1;
  return copy(reply);
}

/**
 * Root posts matching every token. `relevance`: score, likes, newest; `latest`: newest first.
 * `#tag` query -> exact tag match (relevance = likes, newest).
 */
export async function searchPosts(query: string, limit = SEARCH_LIMIT, sort: PostSearchSort = "relevance"): Promise<PostItem[]> {
  await simulateNetwork();

  const trimmed = query.trim();
  if (trimmed.startsWith("#")) {
    const key = tagKey(trimmed);
    if (!key) return [];
    return roots()
      .filter((post) => hasTag(post, key))
      .sort(sort === "latest" ? byNewest : (a, b) => b.likesCount - a.likesCount || byNewest(a, b))
      .slice(0, limit)
      .map(copy);
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return [];

  return roots()
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

export async function fetchPostsByTag(tag: string, sort: TagSort): Promise<TagPage> {
  await simulateNetwork();

  const key = tagKey(tag);
  const matches = roots().filter((post) => hasTag(post, key));
  if (matches.length === 0) return { tag, postsCount: 0, posts: [] };

  const order = sort === "top" ? (a: PostItem, b: PostItem) => b.likesCount - a.likesCount || byNewest(a, b) : byNewest;
  const stat = collectTagStats(matches).get(key);
  return {
    tag: stat?.tag ?? tag,
    postsCount: matches.length,
    posts: matches.sort(order).slice(0, SEARCH_LIMIT).map(copy),
  };
}

/** Most used tags over root posts: count desc, then normalized tag asc. */
export async function fetchTrendingTags(limit: number): Promise<HashtagStat[]> {
  await simulateNetwork();

  return [...collectTagStats(db.values())]
    .sort(([keyA, a], [keyB, b]) => b.postsCount - a.postsCount || keyA.localeCompare(keyB))
    .slice(0, limit)
    .map(([, stat]) => stat);
}

// #region Owner mutations
export async function updatePostContent(id: string, content: string, actorId: string): Promise<PostItem> {
  await simulateNetwork();

  const post = ownedPost(id, actorId);
  const next = content.trim();
  const hasImages = (post.imageUrls?.length ?? 0) > 0 || post.imageUrl !== undefined;
  if (next.length > POST_CONTENT_MAX || (next === "" && !hasImages)) throw new Error("Invalid post content");
  post.content = next;
  post.isEdited = true;
  return copy(post);
}

/** Deletes the post and its whole reply tree; returns every removed id. */
export async function deletePost(id: string, actorId: string): Promise<{ deletedIds: string[] }> {
  await simulateNetwork();

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
      const post = buildPost(input, pick(SEED_AUTHORS), undefined, "post-live");
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
