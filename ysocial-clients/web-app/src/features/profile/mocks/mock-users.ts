import { SEED_AUTHORS, SEED_FOLLOWED_AUTHOR_IDS } from "@/mocks/seed-authors";
import type { UserProfile } from "../types";

type UserExtras = Pick<UserProfile, "bio" | "followersCount" | "followingCount">;

const EXTRAS: Record<string, UserExtras> = {
  "author-01": { bio: "Kiến trúc sư phần mềm. Xây YSocial bằng Clean Architecture.", followersCount: 48_200, followingCount: 120 },
  "author-02": { bio: "Frontend engineer. Next.js & những thứ tối giản.", followersCount: 12_800, followingCount: 340 },
  "author-03": { bio: ".NET & DDD. Thích cà phê đen và code sạch.", followersCount: 9_600, followingCount: 210 },
  "author-04": { bio: "Product designer. Zinc, kính mờ và khoảng trắng.", followersCount: 7_400, followingCount: 512 },
  "author-05": { bio: "Fullstack dev, mê Vertical Slice Architecture.", followersCount: 3_100, followingCount: 280 },
  "author-06": { bio: "Nhiếp ảnh phong cảnh. Đà Lạt là nhà.", followersCount: 21_500, followingCount: 190 },
  "author-07": { bio: "Zustand fan. Viết về React performance.", followersCount: 860, followingCount: 150 },
  "author-08": { bio: "Viết mỗi ngày. Sách, trà và những buổi chiều chậm.", followersCount: 5_200, followingCount: 430 },
};

/** Same ids as post authors, so feeds, search & follow state refer to one person. */
export const MOCK_USERS: UserProfile[] = SEED_AUTHORS.map((author) => ({
  ...author,
  ...EXTRAS[author.id],
  isFollowing: SEED_FOLLOWED_AUTHOR_IDS.includes(author.id),
}));
