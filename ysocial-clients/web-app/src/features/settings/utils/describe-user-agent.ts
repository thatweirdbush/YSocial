export interface DeviceDescription {
  browser: string;
  os: string;
}

// First match wins: Edge & Opera carry "Chrome/", Chrome on iOS says "CriOS", every Chromium says "Safari/"
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

// Mobile first: an iPhone agent also says "like Mac OS X", an Android agent also says "Linux"
const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Windows/, "Windows"],
  [/Android/, "Android"],
  [/iPhone|iPad|iPod/, "iOS"],
  [/Macintosh|Mac OS X/, "macOS"],
  [/Linux|X11/, "Linux"],
];

const find = (table: ReadonlyArray<readonly [RegExp, string]>, ua: string) => table.find(([pattern]) => pattern.test(ua))?.[1];

/** Human label parts of a `User-Agent`; `null` when it says nothing recognizable (the UI shows "unknown device"). */
export function describeUserAgent(userAgent: string | null): DeviceDescription | null {
  if (!userAgent?.trim()) return null;
  const browser = find(BROWSERS, userAgent);
  const os = find(SYSTEMS, userAgent);
  if (!browser && !os) return null;
  return { browser: browser ?? "Browser", os: os ?? "Unknown" };
}
