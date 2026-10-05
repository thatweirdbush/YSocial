import { MOCK_FOLLOWED_AUTHOR_IDS } from "../mocks/mock-authors";
import { MOCK_POSTS } from "../mocks/mock-posts";
import { normalizeText, tokenize } from "@/lib/text";
import type { CreatePostInput, FeedPage, FeedTab, HashtagStat, PostAuthor, PostItem, PostThread, TagPage, TagSort } from "../types";
import { byNewest, collectTagStats, hasTag, tagKey } from "../utils/hashtags";

// Mock data source for posts. Replace the bodies with real API calls when the backend is wired;
// callers (containers + post-store) stay unchanged.

export const FEED_PAGE_SIZE = 10;

/** Max results per search / tag query (no paging yet). */
export const SEARCH_LIMIT = 50;

/** Dev-only: probability (0–1) that a call rejects, to exercise error UI by hand. */
const MOCK_FAILURE_RATE = 0;

let db = new Map<string, PostItem>();
let idCounter = 0;

/** Test-only: restore the in-memory store from the seed dataset. */
export function __resetMockDb(): void {
  db = new Map(MOCK_POSTS.map((post) => [post.id, structuredClone(post)]));
  idCounter = 0;
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

function buildPost(input: CreatePostInput, author: PostAuthor, parentId?: string): PostItem {
  idCounter += 1;
  return {
    id: `post-local-${Date.now()}-${idCounter}`,
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

export async function fetchFeed(tab: FeedTab, page: number): Promise<FeedPage> {
  await simulateNetwork();

  const roots = [...db.values()]
    .filter((post) => post.parentId === undefined)
    .filter((post) => tab === "forYou" || MOCK_FOLLOWED_AUTHOR_IDS.includes(post.user.id))
    .sort(byNewest);

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

/** Root posts matching every token (relevance, likes, newest). `#tag` query -> exact tag match. */
export async function searchPosts(query: string, limit = SEARCH_LIMIT): Promise<PostItem[]> {
  await simulateNetwork();

  const trimmed = query.trim();
  if (trimmed.startsWith("#")) {
    const key = tagKey(trimmed);
    if (!key) return [];
    return roots()
      .filter((post) => hasTag(post, key))
      .sort((a, b) => b.likesCount - a.likesCount || byNewest(a, b))
      .slice(0, limit)
      .map(copy);
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) return [];

  return roots()
    .map((post) => ({ post, score: scorePost(post, tokens) }))
    .filter((entry): entry is { post: PostItem; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score || b.post.likesCount - a.post.likesCount || byNewest(a.post, b.post))
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
