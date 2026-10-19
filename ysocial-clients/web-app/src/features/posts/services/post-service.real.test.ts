import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/store/auth-store";
import { API_BASE_URL } from "@/lib/api-config";
import { mockFetchSequence, problem, setRealSlices, type MockStep } from "@/test/api-test-utils";
import type { PostAuthor, PostRef } from "../types";
import * as postService from "./post-service";
import {
  createPost,
  createReply,
  deletePost,
  fetchFeed,
  fetchPostThread,
  fetchSavedPosts,
  fetchUserPosts,
  setPostBookmark,
  setPostLike,
  updatePostContent,
} from "./post-service.real";

const ME = "0b8f1c52-6a3e-4c53-9b42-5f9d6f7a1e10";
const ROOT = "11111111-1111-4111-8111-111111111111";
const COMMENT = "33333333-3333-4333-8333-333333333333";
const NESTED = "44444444-4444-4444-8444-444444444444";
const author: PostAuthor = { id: ME, displayName: "Me", username: "me" };
const rootRef: PostRef = { id: ROOT, kind: "post", rootPostId: ROOT };
const commentRef: PostRef = { id: COMMENT, kind: "comment", rootPostId: ROOT };

const dto = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: "post",
  postId: id,
  content: `c-${id.slice(0, 4)}`,
  createdAt: "2026-10-19T00:00:00Z",
  isEdited: false,
  likesCount: 0,
  commentsCount: 0,
  isLikedByCurrentUser: false,
  isBookmarkedByCurrentUser: false,
  user: { id: ME, username: "me", displayName: "Me", avatarUrl: null, isVerified: false },
  ...extra,
});
const paged = (ids: string[], page: number, hasNextPage: boolean, extra: Record<string, unknown> = {}): MockStep => ({
  status: 200,
  body: { items: ids.map((id) => dto(id)), page, pageSize: 10, totalCount: ids.length, hasNextPage, ...extra },
});

function useFetch(steps: MockStep[]) {
  const fake = mockFetchSequence(steps);
  vi.stubGlobal("fetch", fake.fetchFn);
  return fake.calls;
}
const path = (call: { url: string }) => call.url.replace(API_BASE_URL, "");
const body = (call: { init?: RequestInit }) => JSON.parse(String(call.init?.body));

beforeEach(() => {
  localStorage.clear();
  useAuthStore.getState().actions.clearAuth();
  useAuthStore.getState().actions.setTokens("A1", "R1");
});
afterEach(() => vi.unstubAllGlobals());

describe("reads", () => {
  it("feed forYou calls /api/feed?tab=forYou&page", async () => {
    const calls = useFetch([paged([ROOT], 1, false)]);
    const page = await fetchFeed("forYou", 1, ME);
    expect(path(calls[0])).toBe("/api/feed?tab=forYou&page=1");
    expect(page.posts.map((p) => p.id)).toEqual([ROOT]);
  });

  it("following for guest returns empty without call", async () => {
    const calls = useFetch([]);
    expect(await fetchFeed("following", 1, "me")).toEqual({ posts: [] });
    expect(calls).toHaveLength(0);
  });

  it("feed page 2 nextPage from hasNextPage", async () => {
    useFetch([paged([ROOT], 2, true), paged([COMMENT], 3, false)]);
    expect((await fetchFeed("forYou", 2, ME)).nextPage).toBe(3);
    expect((await fetchFeed("forYou", 3, ME)).nextPage).toBeUndefined();
  });

  it("thread 404 -> null, non-GUID -> null without fetch", async () => {
    const calls = useFetch([problem(404, "NotFound")]);
    expect(await fetchPostThread(ROOT, ME)).toBeNull();
    expect(await fetchPostThread("post-001", ME)).toBeNull();
    expect(calls).toHaveLength(1);
    expect(path(calls[0])).toBe(`/api/threads/${ROOT}`);
  });

  it("thread network failure rethrown (not null)", async () => {
    useFetch([{ status: 0, reject: new TypeError("Failed to fetch") }, problem(500, "InternalError")]);
    await expect(fetchPostThread(ROOT, ME)).rejects.toMatchObject({ kind: "network" });
    await expect(fetchPostThread(ROOT, ME)).rejects.toMatchObject({ status: 500 });
  });

  it("thread maps post, replies & child replies", async () => {
    useFetch([
      {
        status: 200,
        body: {
          post: dto(ROOT),
          parent: null,
          replies: [dto(COMMENT, { kind: "comment", postId: ROOT, parentId: ROOT })],
          childReplies: { [COMMENT]: [dto(NESTED, { kind: "comment", postId: ROOT, parentId: COMMENT })] },
        },
      },
    ]);
    const thread = await fetchPostThread(ROOT, ME);
    expect(thread?.replies[0]).toMatchObject({ id: COMMENT, kind: "comment", rootPostId: ROOT });
    expect(thread?.childReplies[COMMENT][0].id).toBe(NESTED);
  });

  it("user posts: threads tab only, locked kept", async () => {
    const calls = useFetch([paged([], 1, false, { locked: true })]);
    const page = await fetchUserPosts(ME, "threads", 1, ME);
    expect(path(calls[0])).toBe(`/api/posts/user/${ME}?page=1`);
    expect(page.locked).toBe(true);
    const replies = await fetchUserPosts(ME, "replies", 1, ME);
    expect(replies).toEqual({ posts: [], parents: [], locked: false });
    expect(calls).toHaveLength(1);
  });

  it("saved page maps PostDtoPagedResponse", async () => {
    const calls = useFetch([paged([ROOT, COMMENT], 1, true)]);
    const page = await fetchSavedPosts(ME, 1);
    expect(path(calls[0])).toBe("/api/saveditems/posts?page=1");
    expect(page.posts).toHaveLength(2);
    expect(page.nextPage).toBe(2);
  });
});

describe("writes", () => {
  it("createPost text only sends no imageUrl", async () => {
    const calls = useFetch([{ status: 201, body: dto(ROOT) }]);
    const post = await createPost({ content: "hi", images: [], audience: "anyone" }, author);
    expect(path(calls[0])).toBe("/api/posts");
    expect(body(calls[0])).toEqual({ content: "hi" });
    expect(post.id).toBe(ROOT);
  });

  it("createPost sends the first image only", async () => {
    const calls = useFetch([{ status: 201, body: dto(ROOT) }]);
    await createPost({ content: "hi", images: ["https://x/1.png", "https://x/2.png"], audience: "anyone" }, author);
    expect(body(calls[0])).toEqual({ content: "hi", imageUrl: "https://x/1.png" });
  });

  it("reply to root post: postId = root, no parentCommentId", async () => {
    const calls = useFetch([{ status: 201, body: dto(COMMENT, { kind: "comment", postId: ROOT, parentId: ROOT }) }]);
    const reply = await createReply(rootRef, { content: "re", images: [], audience: "anyone" }, author);
    expect(path(calls[0])).toBe("/api/comments");
    expect(body(calls[0])).toEqual({ postId: ROOT, content: "re" });
    expect(reply).toMatchObject({ kind: "comment", rootPostId: ROOT });
  });

  it("reply to nested comment: postId = rootPostId, parentCommentId = ref.id", async () => {
    const calls = useFetch([{ status: 201, body: dto(NESTED, { kind: "comment", postId: ROOT, parentId: COMMENT }) }]);
    await createReply(commentRef, { content: "re2", images: [], audience: "anyone" }, author);
    expect(body(calls[0])).toEqual({ postId: ROOT, content: "re2", parentCommentId: COMMENT });
  });

  it("edit & delete route by kind", async () => {
    const calls = useFetch([
      { status: 200, body: dto(ROOT, { content: "edited", isEdited: true }) },
      { status: 200, body: dto(COMMENT, { kind: "comment", postId: ROOT }) },
      { status: 204 },
      { status: 204 },
    ]);
    const edited = await updatePostContent(rootRef, "edited", ME);
    await updatePostContent(commentRef, "c", ME);
    expect(edited).toMatchObject({ content: "edited", isEdited: true });
    expect(await deletePost(rootRef, ME)).toEqual({ deletedIds: [ROOT] });
    expect(await deletePost(commentRef, ME)).toEqual({ deletedIds: [COMMENT] });
    expect(calls.map((c) => `${c.init?.method} ${path(c)}`)).toEqual([
      `PUT /api/posts/${ROOT}`,
      `PUT /api/comments/${COMMENT}`,
      `DELETE /api/posts/${ROOT}`,
      `DELETE /api/comments/${COMMENT}`,
    ]);
    expect(body(calls[0])).toEqual({ content: "edited" });
  });

  it("like & bookmark use idempotent PUT/DELETE by kind", async () => {
    const calls = useFetch([{ status: 204 }, { status: 204 }, { status: 204 }, { status: 204 }]);
    await setPostLike(rootRef, true);
    await setPostLike(commentRef, false);
    await setPostBookmark(commentRef, true);
    await setPostBookmark(rootRef, false);
    expect(calls.map((c) => `${c.init?.method} ${path(c)}`)).toEqual([
      `PUT /api/posts/${ROOT}/like`,
      `DELETE /api/comments/${COMMENT}/like`,
      `PUT /api/comments/${COMMENT}/bookmark`,
      `DELETE /api/posts/${ROOT}/bookmark`,
    ]);
  });

  it("non-GUID ref id -> local 404, no fetch", async () => {
    const calls = useFetch([]);
    const bad: PostRef = { id: "post-001", kind: "post", rootPostId: "post-001" };
    await expect(setPostLike(bad, true)).rejects.toMatchObject({ status: 404 });
    await expect(deletePost(bad, ME)).rejects.toMatchObject({ status: 404 });
    await expect(createReply(bad, { content: "x", images: [], audience: "anyone" }, author)).rejects.toMatchObject({ status: 404 });
    expect(calls).toHaveLength(0);
  });

  it("404 on like (blocked mid-session) rejects ApiError so op-ledger rolls back", async () => {
    useFetch([problem(404, "NotFound")]);
    await expect(setPostLike(rootRef, true)).rejects.toMatchObject({ status: 404, code: "NotFound" });
  });
});

describe("dispatch", () => {
  it("post-service uses the real adapter only when content is real", async () => {
    const calls = useFetch([{ status: 204 }]);
    setRealSlices("auth,content");
    await postService.setPostLike(rootRef, true);
    expect(calls).toHaveLength(1);

    setRealSlices("auth");
    await postService.setPostLike({ id: "post-001", kind: "post", rootPostId: "post-001" }, true);
    expect(calls).toHaveLength(1);
  });
});
