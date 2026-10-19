import type { PostItem } from "@/features/posts/types";

// #region Domain models
export interface Collection {
  id: string;
  name: string;
  slug: string;
}

export interface SavedItem {
  id: string;
  post: PostItem;
  collectionIds: string[];
  savedAt: string;
}
// #endregion
