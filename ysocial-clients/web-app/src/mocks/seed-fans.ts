import type { PostAuthor } from "@/features/posts/types";
import { SEED_AUTHORS, SEED_DEMO_ACCOUNT } from "./seed-authors";

// Deterministic mock fans: exactly one level below the base users. Fans follow only their base user and have
// no followers of their own, so follow lists stay realistic without a recursive graph.

/** Base users that get fans: the seed authors plus the demo account. */
export const FAN_BASE_IDS: readonly string[] = [...SEED_AUTHORS.map((author) => author.id), SEED_DEMO_ACCOUNT.id];

const MIN_FANS = 30;
const FAN_SPREAD = 31;
const AVATAR_PROBABILITY = 0.5;

const FAMILY_NAMES = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ"];
const GIVEN_NAMES: ReadonlyArray<readonly [display: string, ascii: string]> = [
  ["An", "an"],
  ["Bình", "binh"],
  ["Châu", "chau"],
  ["Dũng", "dung"],
  ["Giang", "giang"],
  ["Hạnh", "hanh"],
  ["Khôi", "khoi"],
  ["Linh", "linh"],
  ["Minh", "minh"],
  ["Ngân", "ngan"],
  ["Phúc", "phuc"],
  ["Quân", "quan"],
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");

export const isFanId = (id: string): boolean => id.startsWith("fan-");

function buildFans(): { fans: PostAuthor[]; follows: Record<string, string[]> } {
  const rand = mulberry32(0x5eed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const avatarPool = SEED_AUTHORS.flatMap((author) => (author.avatarUrl ? [author.avatarUrl] : []));

  const fans: PostAuthor[] = [];
  const follows: Record<string, string[]> = {};

  FAN_BASE_IDS.forEach((baseId, baseIndex) => {
    const count = MIN_FANS + Math.floor(rand() * FAN_SPREAD);
    const fanIds: string[] = [];
    for (let n = 1; n <= count; n++) {
      const suffix = `${pad(baseIndex + 1, 2)}${pad(n, 3)}`;
      const [given, asciiGiven] = pick(GIVEN_NAMES);
      const family = pick(FAMILY_NAMES);
      const hasAvatar = rand() < AVATAR_PROBABILITY;
      const avatarUrl = pick(avatarPool);
      const id = `fan-${pad(baseIndex + 1, 2)}-${pad(n, 3)}`;
      fans.push({
        id,
        displayName: `${family} ${given}`,
        username: `${asciiGiven}.${suffix}`,
        ...(hasAvatar ? { avatarUrl } : {}),
      });
      fanIds.push(id);
    }
    follows[baseId] = fanIds;
  });

  return { fans, follows };
}

const built = buildFans();

export const SEED_FANS: PostAuthor[] = built.fans;

/** baseId -> ids of the fans following it. */
export const SEED_FAN_FOLLOWS: Readonly<Record<string, readonly string[]>> = built.follows;
