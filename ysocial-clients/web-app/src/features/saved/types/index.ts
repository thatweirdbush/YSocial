import type { PostItem } from "@/features/posts/types";
import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type ToggleSavedItemRequest = Schemas["ToggleSavedItemRequest"];
export type SavedItemTargetType = Schemas["SavedItemTargetType"];
// #endregion

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
