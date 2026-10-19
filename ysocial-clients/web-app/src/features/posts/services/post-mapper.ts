import type {
  FeedPage,
  PostAuthor,
  PostAuthorDto,
  PostDto,
  PostDtoPagedResponse,
  PostItem,
  PostThread,
  PostVisibility,
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

const toAuthor = (dto: PostAuthorDto): PostAuthor => ({
  id: dto.id,
  displayName: dto.displayName ?? "",
  username: dto.username ?? "",
  avatarUrl: dto.avatarUrl ?? undefined,
  isVerified: dto.isVerified,
});

export function toPostItem(dto: PostDto): PostItem {
  const item: PostItem = {
    id: dto.id,
    kind: dto.kind === "comment" ? "comment" : "post",
    rootPostId: dto.postId,
    content: dto.content ?? "",
    createdAt: dto.createdAt,
    likesCount: dto.likesCount,
    commentsCount: dto.commentsCount,
    isLikedByCurrentUser: dto.isLikedByCurrentUser,
    isBookmarkedByCurrentUser: dto.isBookmarkedByCurrentUser,
    isEdited: dto.isEdited,
    user: toAuthor(dto.user),
  };
  if (dto.parentId) item.parentId = dto.parentId;
  if (dto.imageUrl) {
    item.imageUrl = dto.imageUrl;
    item.imageUrls = [dto.imageUrl];
  }
  const visibility = toVisibility(dto.visibility);
  if (visibility) item.visibility = visibility;
  return item;
}

export function toPostThread(dto: ThreadDto): PostThread {
  const childReplies: Record<string, PostItem[]> = {};
  for (const [replyId, children] of Object.entries(dto.childReplies ?? {})) {
    childReplies[replyId] = children.map(toPostItem);
  }
  return {
    post: toPostItem(dto.post),
    parent: dto.parent ? toPostItem(dto.parent) : undefined,
    replies: (dto.replies ?? []).map(toPostItem),
    childReplies,
  };
}

const nextPageOf = (page: { page: number; hasNextPage: boolean }): number | undefined =>
  page.hasNextPage ? page.page + 1 : undefined;

export function toFeedPage(dto: PostDtoPagedResponse): FeedPage {
  return { posts: (dto.items ?? []).map(toPostItem), nextPage: nextPageOf(dto) };
}

/** Threads tab only: the BE has no replies/media tabs, so `parents` is always empty. */
export function toUserPostsPage(dto: UserPostsPageDto): UserPostsPage {
  return { posts: (dto.items ?? []).map(toPostItem), parents: [], nextPage: nextPageOf(dto), locked: dto.locked };
}
