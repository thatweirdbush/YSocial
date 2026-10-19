import { apiClient } from "@/lib/api-client";
import { isBackendId, requireBackendId } from "@/lib/backend-id";
import { isNotFound } from "@/lib/server-api";
import type {
  CreatePostInput,
  FeedPage,
  FeedTab,
  PostAuthor,
  PostDto,
  PostDtoPagedResponse,
  PostItem,
  PostRef,
  PostThread,
  SavedPostsPage,
  ThreadDto,
  UserPostsPage,
  UserPostsPageDto,
  UserPostsTab,
} from "../types";
import { toFeedPage, toPostItem, toPostThread, toUserPostsPage } from "./post-mapper";

// Real BE adapter of `post-service` (MAP §2.3). Same signatures as the mock. Endpoint choice (`posts` vs
// `comments`) always comes from `PostRef.kind`; non-GUID ids fail locally with a 404 and never reach the network.

const resource = (ref: PostRef): string => `/api/${ref.kind === "comment" ? "comments" : "posts"}/${requireBackendId(ref.id)}`;

export async function fetchFeed(tab: FeedTab, page: number, viewerId: string): Promise<FeedPage> {
  // The following tab needs a token (BE 401 for guests): answer empty instead of calling
  if (tab === "following" && !isBackendId(viewerId)) return { posts: [] };
  return toFeedPage(await apiClient.get<PostDtoPagedResponse>("/api/feed", { params: { tab, page } }));
}

/** Threads tab only: the BE has no replies/media tabs (hidden by the capability table). */
export async function fetchUserPosts(userId: string, tab: UserPostsTab, page: number, _actorId: string): Promise<UserPostsPage> {
  if (tab !== "threads") return { posts: [], parents: [], locked: false };
  try {
    return toUserPostsPage(await apiClient.get<UserPostsPageDto>(`/api/posts/user/${requireBackendId(userId)}`, { params: { page } }));
  } catch (error) {
    // Blocked or deleted author: the profile route owns the not-found state, the tab is just empty
    if (isNotFound(error)) return { posts: [], parents: [], locked: false };
    throw error;
  }
}

/** 404 (unknown, hidden, blocked) and non-GUID ids -> `null`; every other failure is rethrown. */
export async function fetchPostThread(id: string, _actorId: string): Promise<PostThread | null> {
  if (!isBackendId(id)) return null;
  try {
    return toPostThread(await apiClient.get<ThreadDto>(`/api/threads/${id}`));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function fetchSavedPosts(_actorId: string, page: number): Promise<SavedPostsPage> {
  const { posts, nextPage } = toFeedPage(await apiClient.get<PostDtoPagedResponse>("/api/saveditems/posts", { params: { page } }));
  return { posts, nextPage };
}

/** Text + first image only: the BE post has a single `imageUrl` & no audience/visibility choice yet. */
export async function createPost(input: CreatePostInput, _author: PostAuthor): Promise<PostItem> {
  const image = input.images[0];
  return toPostItem(await apiClient.post<PostDto>("/api/posts", { content: input.content, ...(image ? { imageUrl: image } : {}) }));
}

/** Replies always target the ROOT post; replying to a comment adds `parentCommentId`. */
export async function createReply(parent: PostRef, input: CreatePostInput, _author: PostAuthor): Promise<PostItem> {
  const postId = requireBackendId(parent.rootPostId);
  const parentCommentId = parent.kind === "comment" ? requireBackendId(parent.id) : undefined;
  return toPostItem(
    await apiClient.post<PostDto>("/api/comments", { postId, content: input.content, ...(parentCommentId ? { parentCommentId } : {}) }),
  );
}

export async function updatePostContent(ref: PostRef, content: string, _actorId: string): Promise<PostItem> {
  return toPostItem(await apiClient.put<PostDto>(resource(ref), { content }));
}

/** BE answers 204 and hides the thread; nothing is cascade-deleted, so only the target id is reported. */
export async function deletePost(ref: PostRef, _actorId: string): Promise<{ deletedIds: string[] }> {
  await apiClient.delete(resource(ref));
  return { deletedIds: [ref.id] };
}

export async function setPostLike(ref: PostRef, liked: boolean): Promise<void> {
  const url = `${resource(ref)}/like`;
  await (liked ? apiClient.put(url) : apiClient.delete(url));
}

export async function setPostBookmark(ref: PostRef, bookmarked: boolean): Promise<void> {
  const url = `${resource(ref)}/bookmark`;
  await (bookmarked ? apiClient.put(url) : apiClient.delete(url));
}
