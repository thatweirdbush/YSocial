import { apiClient } from "@/lib/api-client";
import { isBackendId, requireBackendId } from "@/lib/backend-id";
import { isApiError } from "@/lib/api-error";
import { isNotFound } from "@/lib/server-api";
import type {
  CreatePostInput,
  FeedPage,
  FeedTab,
  HashtagStat,
  PostAuthor,
  PostDto,
  PostDtoPagedResponse,
  PostItem,
  PostRef,
  PostThread,
  SavedPostsPage,
  TagPage,
  TagPostsPageDto,
  TagSort,
  ThreadDto,
  TrendingTagDto,
  UserPostsPage,
  UserPostsPageDto,
  UserPostsTab,
} from "../types";
import { toFeedPage, toPostItem, toPostThread, toTagPage, toUserPostsPage } from "./post-mapper";

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

/**
 * Text + uploaded media (`mediaIds`, D33) OR one external http(s) image (GIF picker): the BE refuses both together, and a
 * blob: preview is never a real url. No audience/visibility choice yet.
 */
export async function createPost(input: CreatePostInput, _author: PostAuthor): Promise<PostItem> {
  const mediaIds = input.mediaIds ?? [];
  const image = mediaIds.length === 0 ? input.images.find((url) => /^https?:\/\//i.test(url)) : undefined;

  return toPostItem(
    await apiClient.post<PostDto>("/api/posts", {
      content: input.content,
      ...(mediaIds.length > 0 ? { mediaIds } : {}),
      ...(image ? { imageUrl: image } : {}),
    }),
  );
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

// #region Discovery (MAP 2.9): the viewer always comes from the JWT, `actorId` is never sent

const TAG_PAGE_SIZE = 50;

export async function fetchTrendingTags(limit: number): Promise<HashtagStat[]> {
  const tags = await apiClient.get<TrendingTagDto[] | null>("/api/trending/tags", { params: { limit } });
  return (tags ?? []).filter((entry) => entry.tag).map((entry) => ({ tag: entry.tag as string, postsCount: entry.postsCount ?? 0 }));
}

/** First page only. A tag the BE rejects (400: not a tag) is an empty page, like an unknown tag. */
export async function fetchPostsByTag(tag: string, sort: TagSort, _actorId: string): Promise<TagPage> {
  try {
    const page = await apiClient.get<TagPostsPageDto>(`/api/tags/${encodeURIComponent(tag)}/posts`, {
      params: { sort, page: 1, pageSize: TAG_PAGE_SIZE },
    });
    return toTagPage(page, tag);
  } catch (error) {
    if (isApiError(error) && error.kind === "http" && error.status === 400) return { tag, postsCount: 0, posts: [] };
    throw error;
  }
}

// #endregion
