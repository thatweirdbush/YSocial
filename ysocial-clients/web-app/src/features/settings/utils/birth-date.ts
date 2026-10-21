import { localDateKey } from "./usage-tracker";

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const OLDEST_YEAR = 1900;

/**
 * Request value of a plain `yyyy-MM-dd` date: the BE reads `date-time`, stores the date part & answers `yyyy-MM-dd`.
 * String concat on purpose: a `Date` round trip shifts the day in timezones west or east of UTC.
 */
export const toWireBirthDate = (ymd: string): string => `${ymd}T00:00:00Z`;

/** Latest selectable birth date (yesterday, local calendar): the BE rejects today & the future. */
export function maxBirthDate(now: number = Date.now()): string {
  const date = new Date(now);
  return localDateKey(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1).getTime());
}

/** A real calendar date between 1900 and yesterday. */
export function isPastBirthDate(ymd: string, now: number = Date.now()): boolean {
  const match = YMD.exec(ymd);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  const real = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return real && year >= OLDEST_YEAR && ymd <= maxBirthDate(now);
}
