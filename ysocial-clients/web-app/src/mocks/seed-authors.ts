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

/** Mock-login account (spec D10). A real mock user, but NOT part of `SEED_AUTHORS` so author pools & index-based mock posts stay unchanged. */
export const SEED_DEMO_ACCOUNT: PostAuthor = {
  id: "1",
  displayName: "YSocial Member",
  username: "ysocial_member",
  isVerified: true,
  avatarUrl: avatar("photo-1527980965255-d3b416303d12"),
};

/** Authors every viewer follows initially (seed of the viewer-scoped follow graph). */
export const SEED_FOLLOWED_AUTHOR_IDS: readonly string[] = ["author-02", "author-03", "author-06"];

/** Who each seed user follows (base users follow each other; demo & legacy guest actor follow the viewer default). */
export const SEED_FOLLOWING: Readonly<Record<string, readonly string[]>> = {
  "author-01": ["author-02", "author-03", "author-06"],
  "author-02": ["author-01", "author-04"],
  "author-03": ["author-01", "author-02", "author-05", "1"],
  "author-04": ["author-02", "author-06"],
  "author-05": ["author-01", "author-03"],
  "author-06": ["author-01", "author-08"],
  "author-07": ["author-01", "author-02", "author-03"],
  "author-08": ["author-04", "author-06"],
  "1": SEED_FOLLOWED_AUTHOR_IDS,
  me: SEED_FOLLOWED_AUTHOR_IDS,
};

/** Close friend flags per observer (observer -> targets marked); effective only on accepted edges. */
export const SEED_CLOSE_FRIENDS: Readonly<Record<string, readonly string[]>> = {
  "author-03": ["1"],
  "1": ["author-03"],
};
