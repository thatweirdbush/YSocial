import { SEED_AUTHORS, SEED_DEMO_ACCOUNT } from "@/mocks/seed-authors";
import { SEED_FANS } from "@/mocks/seed-fans";
import type { StoredUser } from "../types";

const BIOS: Record<string, string> = {
  "author-01": "Kiến trúc sư phần mềm. Xây YSocial bằng Clean Architecture.",
  "author-02": "Frontend engineer. Next.js & những thứ tối giản.",
  "author-03": ".NET & DDD. Thích cà phê đen và code sạch.",
  "author-04": "Product designer. Zinc, kính mờ và khoảng trắng.",
  "author-05": "Fullstack dev, mê Vertical Slice Architecture.",
  "author-06": "Nhiếp ảnh phong cảnh. Đà Lạt là nhà.",
  "author-07": "Zustand fan. Viết về React performance.",
  "author-08": "Viết mỗi ngày. Sách, trà và những buổi chiều chậm.",
  [SEED_DEMO_ACCOUNT.id]: "Joined YSocial Premium Social Ecosystem",
};

/**
 * Deterministic baseline added to the graph-derived relation count (spec D6): the dialog lists a partial mock
 * dataset, so the visible count intentionally exceeds the materialized list. Absent id -> 0.
 */
export const HIDDEN_FOLLOWERS: Readonly<Record<string, number>> = {
  "author-01": 48_200,
  "author-02": 12_800,
  "author-03": 9_600,
  "author-04": 7_400,
  "author-05": 3_100,
  "author-06": 21_500,
  "author-07": 860,
  "author-08": 5_200,
};

export const HIDDEN_FOLLOWING: Readonly<Record<string, number>> = {
  "author-01": 120,
  "author-02": 340,
  "author-03": 210,
  "author-04": 512,
  "author-05": 280,
  "author-06": 190,
  "author-07": 150,
  "author-08": 430,
};

/** Frozen seed: authors, the demo account and their fans. Same ids as post authors, so feeds, search & follow state refer to one person. */
export const MOCK_USERS: readonly StoredUser[] = Object.freeze(
  [...SEED_AUTHORS, SEED_DEMO_ACCOUNT, ...SEED_FANS].map((author) =>
    Object.freeze<StoredUser>({ ...author, ...(BIOS[author.id] ? { bio: BIOS[author.id] } : {}) }),
  ),
);

const seedByUsername = new Map(MOCK_USERS.map((user) => [user.username.toLowerCase(), user]));

/**
 * Pure, server-safe lookup over the frozen seed ONLY - never the mutable user-service db or runtime users
 * (spec D7: no server-side fake DB). Case-insensitive.
 */
export function getSeedUserByUsername(username: string): StoredUser | undefined {
  return seedByUsername.get(username.toLowerCase());
}

const seedIds = new Set(MOCK_USERS.map((user) => user.id));

export const isSeedUserId = (id: string): boolean => seedIds.has(id);
