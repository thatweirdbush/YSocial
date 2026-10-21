/**
 * Media boxes keep the picture's proportions (no layout shift) through STATIC Tailwind classes, so no inline style is needed:
 * the ratio is clamped to 4:5..16:9 and snapped to the nearest bucket.
 */
const BUCKETS: ReadonlyArray<{ ratio: number; className: string }> = [
  { ratio: 4 / 5, className: "aspect-[4/5]" },
  { ratio: 1, className: "aspect-square" },
  { ratio: 5 / 4, className: "aspect-[5/4]" },
  { ratio: 4 / 3, className: "aspect-[4/3]" },
  { ratio: 3 / 2, className: "aspect-[3/2]" },
  { ratio: 16 / 9, className: "aspect-video" },
];

export function aspectClassOf(width: number | null | undefined, height: number | null | undefined): string {
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return "aspect-square";

  const ratio = Math.min(Math.max(width / height, BUCKETS[0].ratio), BUCKETS[BUCKETS.length - 1].ratio);

  return BUCKETS.reduce((best, bucket) => (Math.abs(Math.log(bucket.ratio / ratio)) < Math.abs(Math.log(best.ratio / ratio)) ? bucket : best)).className;
}
