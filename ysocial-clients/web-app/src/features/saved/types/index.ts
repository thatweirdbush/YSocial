import { PostItem } from "@/features/posts/components/post-card";

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
