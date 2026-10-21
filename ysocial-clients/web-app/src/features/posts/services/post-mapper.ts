import { ApiError } from "@/lib/api-error";
import type {
  FeedPage,
  MediaDto,
  PostMediaItem,
  PostAuthor,
  PostAuthorDto,
  PostDto,
  PostDtoPagedResponse,
  PostItem,
  PostThread,
  PostVisibility,
  TagPage,
  TagPostsPageDto,
  ThreadDto,
  UserPostsPage,
  UserPostsPageDto,
} from "../types";

// DTO -> domain mappers (MAP §1, §3): nearly every swagger field is nullable & enums are plain strings, so
// mappers accept null/absent and never trust an enum value they do not know.

const KNOWN_VISIBILITY: ReadonlySet<string> = new Set<PostVisibility>(["public", "closeFriends", "followersOnly", "private"]);

/** Unknown visibility is treated as the most restrictive value (`private`); null/absent = no visibility set. */
const toVisibility = (value: string | null | undefined): PostVisibility | undefined => {
  if (value === null || value === undefined) return undefined;
  return KNOWN_VISIBILITY.has(value) ? (value as PostVisibility) : "private";
};

/** Swagger marks every field optional (M12): a missing identity field is a contract breach, never defaulted. */
function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined || value === "") {
    throw new ApiError({ kind: "http", status: 200, code: "Unknown", detail: `Malformed DTO: missing ${field}` });
  }
  return value;
}

const toAuthor = (dto: PostAuthorDto | undefined): PostAuthor => ({
  id: required(dto?.id, "user.id"),
  displayName: dto?.displayName ?? "",
  username: dto?.username ?? "",
  avatarUrl: dto?.avatarUrl ?? undefined,
  isVerified: dto?.isVerified ?? false,
});

/** A media item the UI cannot render (unknown kind, no url) is dropped: the post still shows its text and the other media. */
function toMediaItems(dtos: readonly MediaDto[] | null | undefined): PostMediaItem[] {
  const items: PostMediaItem[] = [];

  for (const dto of dtos ?? []) {
    if ((dto.kind !== "image" && dto.kind !== "video") || !dto.url) continue;

    const item: PostMediaItem = { kind: dto.kind, url: dto.url };
    if (dto.id) item.id = dto.id;
    if (dto.posterUrl) item.posterUrl = dto.posterUrl;
    if (typeof dto.width === "number") item.width = dto.width;
    if (typeof dto.height === "number") item.height = dto.height;
    if (typeof dto.durationSeconds === "number") item.durationSeconds = dto.durationSeconds;
    items.push(item);
  }

  return items;
}

export function toPostItem(dto: PostDto): PostItem {
  const item: PostItem = {
    id: required(dto.id, "id"),
    kind: dto.kind === "comment" ? "comment" : "post",
    rootPostId: required(dto.postId, "postId"),
    content: dto.content ?? "",
    createdAt: required(dto.createdAt, "createdAt"),
    likesCount: dto.likesCount ?? 0,
    commentsCount: dto.commentsCount ?? 0,
    isLikedByCurrentUser: dto.isLikedByCurrentUser ?? false,
    isBookmarkedByCurrentUser: dto.isBookmarkedByCurrentUser ?? false,
    isEdited: dto.isEdited ?? false,
    user: toAuthor(dto.user),
  };
  if (dto.parentId) item.parentId = dto.parentId;
  const media = toMediaItems(dto.media);
  if (media.length > 0) item.media = media;
  if (dto.imageUrl) {
    item.imageUrl = dto.imageUrl;
    // With uploaded media the grid reads `media`; the list stays for posts that only have the legacy image
    if (media.length === 0) item.imageUrls = [dto.imageUrl];
  }
  const visibility = toVisibility(dto.visibility);
  if (visibility) item.visibility = visibility;
  return item;
}

/** List mapper: a malformed item (contract breach) is dropped with a warning so the rest of the page survives. */
function toPostItems(dtos: readonly PostDto[] | null | undefined): PostItem[] {
  const items: PostItem[] = [];
  for (const dto of dtos ?? []) {
    try {
      items.push(toPostItem(dto));
    } catch (error) {
      console.warn("[post-mapper] dropped malformed item", error);
    }
  }
  return items;
}

export function toPostThread(dto: ThreadDto): PostThread {
  if (!dto.post) throw new ApiError({ kind: "http", status: 200, code: "Unknown", detail: "Malformed ThreadDto: missing post" });
  const childReplies: Record<string, PostItem[]> = {};
  for (const [replyId, children] of Object.entries(dto.childReplies ?? {})) {
    childReplies[replyId] = toPostItems(children);
  }
  return {
    post: toPostItem(dto.post),
    parent: dto.parent ? toPostItem(dto.parent) : undefined,
    replies: toPostItems(dto.replies),
    childReplies,
  };
}

const nextPageOf = (page: { page?: number; hasNextPage?: boolean }): number | undefined =>
  page.hasNextPage ? (page.page ?? 1) + 1 : undefined;

export function toFeedPage(dto: PostDtoPagedResponse): FeedPage {
  return { posts: toPostItems(dto.items), nextPage: nextPageOf(dto) };
}

/** Threads tab only: the BE has no replies/media tabs, so `parents` is always empty. */
export function toUserPostsPage(dto: UserPostsPageDto): UserPostsPage {
  return { posts: toPostItems(dto.items), parents: [], nextPage: nextPageOf(dto), locked: dto.locked ?? false };
}

/** `postsCount` = BE `totalCount` (all visible matching posts); `tag` falls back to the requested one. */
export function toTagPage(dto: TagPostsPageDto, requestedTag: string): TagPage {
  return { tag: dto.tag || requestedTag, postsCount: dto.totalCount ?? 0, posts: toPostItems(dto.items) };
}
