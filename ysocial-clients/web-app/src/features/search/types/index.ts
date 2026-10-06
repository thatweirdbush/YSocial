import type { HashtagStat, PostItem } from "@/features/posts/types";
import type { UserProfile } from "@/features/profile/types";

// #region Domain models
export type SearchTab = "top" | "users" | "posts" | "tags";

export const SEARCH_TABS: readonly SearchTab[] = ["top", "users", "posts", "tags"];

/** Entities returned by one search; containers upsert them into post/user stores. */
export interface SearchResponse {
  users: UserProfile[];
  /** Relevance order (Top tab). */
  posts: PostItem[];
  /** Newest first (Posts tab), ordered by the service. */
  latestPosts: PostItem[];
  tags: HashtagStat[];
}

/** Cached search result: ids only, entities live in the normalized stores. */
export interface SearchResult {
  query: string;
  userIds: string[];
  /** Relevance order (Top tab). */
  postIds: string[];
  /** Newest first (Posts tab), in service order. */
  latestPostIds: string[];
  tags: HashtagStat[];
}

export interface SearchSuggestions {
  users: UserProfile[];
  tags: HashtagStat[];
}

export interface TagPageCache {
  tag: string;
  postsCount: number;
  postIds: string[];
}
// #endregion
