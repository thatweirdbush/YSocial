export type PostAudience = "anyone" | "followers" | "following" | "mention";

export interface PostDraft {
  id: string;
  content: string;
  images: string[];
  audience: PostAudience;
  createdAt: number;
}
