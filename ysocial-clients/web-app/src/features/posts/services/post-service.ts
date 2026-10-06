import { MOCK_FOLLOWED_AUTHOR_IDS } from "../mocks/mock-authors";
import { MOCK_POSTS } from "../mocks/mock-posts";
import type { CreatePostInput, FeedPage, FeedTab, PostAuthor, PostItem, PostThread } from "../types";

// Mock data source for posts. Replace the bodies with real API calls when the backend is wired;
// callers (containers + post-store) stay unchanged.

export const FEED_PAGE_SIZE = 10;

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

const byNewest = (a: PostItem, b: PostItem) => Date.parse(b.createdAt) - Date.parse(a.createdAt);

const copy = (post: PostItem): PostItem => structuredClone(post);

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
