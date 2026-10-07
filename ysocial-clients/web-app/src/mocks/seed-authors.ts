import type { PostAuthor } from "@/features/posts/types";

// Shared mock seed: post authors = mock users (same ids). Lives outside features to avoid barrel import cycles.

const avatar = (photo: string) => `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=100&q=80`;

export const SEED_AUTHORS: PostAuthor[] = [
  { id: "author-01", displayName: "Antigravity Architect", username: "antigravity.core", avatarUrl: avatar("photo-1570295999919-56ceb5ecca61"), isVerified: true },
  { id: "author-02", displayName: "Elena Vance", username: "elena_v", avatarUrl: avatar("photo-1544005313-94ddf0286df2") },
  { id: "author-03", displayName: "Trần Anh Quốc", username: "anquoc.dev", avatarUrl: avatar("photo-1535713875002-d1d0cf377fde"), isVerified: true },
  { id: "author-04", displayName: "Nguyễn Minh Thư", username: "minhthu.design", avatarUrl: avatar("photo-1494790108377-be9c29b29330") },
  { id: "author-05", displayName: "Lê Hoàng Nam", username: "namle.codes", avatarUrl: avatar("photo-1500648767791-00dcc994a43e") },
  { id: "author-06", displayName: "Phạm Gia Hân", username: "giahan.photo", avatarUrl: avatar("photo-1438761681033-6461ffad8d80"), isVerified: true },
  { id: "author-07", displayName: "Võ Đức Huy", username: "huyvo", avatarUrl: avatar("photo-1506794778202-cad84cf45f1d") },
  { id: "author-08", displayName: "Đặng Bảo Ngọc", username: "baongoc.writes", avatarUrl: avatar("photo-1534528741775-53994a69daeb") },
];

/** Authors every viewer follows initially (seed of the viewer-scoped follow graph). */
export const SEED_FOLLOWED_AUTHOR_IDS: readonly string[] = ["author-02", "author-03", "author-06"];
