import { describe, expect, it } from "vitest";
import { describeUserAgent } from "./describe-user-agent";

const CHROME_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";
const SAFARI_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";
const FIREFOX_ANDROID = "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0";
const CHROME_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const EDGE_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";

describe("describeUserAgent", () => {
  it.each([
    [CHROME_WIN, "Chrome", "Windows"],
    [EDGE_WIN, "Edge", "Windows"],
    [FIREFOX_LINUX, "Firefox", "Linux"],
    [SAFARI_MAC, "Safari", "macOS"],
    [CHROME_MAC, "Chrome", "macOS"],
    [EDGE_MAC, "Edge", "macOS"],
    [SAFARI_IOS, "Safari", "iOS"],
    [CHROME_IOS, "Chrome", "iOS"],
    [CHROME_ANDROID, "Chrome", "Android"],
    [FIREFOX_ANDROID, "Firefox", "Android"],
  ])("%s", (ua, browser, os) => {
    expect(describeUserAgent(ua)).toEqual({ browser, os });
  });

  it("null, blank & unrecognized agents are unknown", () => {
    expect(describeUserAgent(null)).toBeNull();
    expect(describeUserAgent("")).toBeNull();
    expect(describeUserAgent("TestAgent/1.0")).toBeNull();
  });

  it("names what it recognizes when only one part is known", () => {
    expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0) Gecko")).toEqual({ browser: "Browser", os: "Windows" });
  });
});
