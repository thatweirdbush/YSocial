import { describe, expect, it } from "vitest";
import { setRealSlices } from "@/test/api-test-utils";
import { type Capability, CAPABILITY_RULES, hasCapability } from "./capabilities";

const BE_LESS: Capability[] = [
  "search",
  "tags",
  "trending",
  "suggestions",
  "pin",
  "hideLikeCount",
  "multiImage",
  "postAudience",
  "profileRepliesMedia",
  "newPostsPill",
  "closeFriendsBadge",
  "followingTabGuest",
];
const GRAPH: Capability[] = ["followLists", "blockUi", "closeFriendsUi", "privacyUi", "followRequestsUi"];
/** Need a real identity (no mock adapter): follow the auth slice only */
const AUTH_ONLY: Capability[] = ["accountUi", "profileSwitcher"];

const ALL = Object.keys(CAPABILITY_RULES) as Capability[];

/** state -> [content real, graph real, activity real] */
const STATES: Array<[string, boolean, boolean, boolean]> = [
  ["", false, false, false],
  ["auth", false, false, false],
  ["auth,content", true, false, false],
  ["auth,content,graph", true, true, false],
  ["auth,content,graph,activity", true, true, true],
];

describe("capability table", () => {
  it("covers exactly the known capabilities", () => {
    expect([...ALL].sort()).toEqual([...BE_LESS, ...GRAPH, ...AUTH_ONLY, "muteUi", "notificationSettings", "mentionNotifications"].sort());
  });

  it.each(STATES)("slices %j", (slices, content, graph, activity) => {
    setRealSlices(slices);
    for (const capability of BE_LESS) expect(hasCapability(capability), capability).toBe(!content);
    for (const capability of GRAPH) expect(hasCapability(capability), capability).toBe(!content || graph);
    for (const capability of AUTH_ONLY) expect(hasCapability(capability), capability).toBe(slices.includes("auth"));
    expect(hasCapability("muteUi")).toBe(!content || activity);
    expect(hasCapability("notificationSettings")).toBe(!content || activity);
    expect(hasCapability("mentionNotifications")).toBe(!content && !activity);
  });

  it("auth-only capabilities: unset env = on, none = off, auth only = on", () => {
    for (const capability of AUTH_ONLY) {
      setRealSlices(undefined);
      expect(hasCapability(capability), `${capability} unset`).toBe(true);
      setRealSlices("none");
      expect(hasCapability(capability), `${capability} none`).toBe(false);
      setRealSlices("auth");
      expect(hasCapability(capability), `${capability} auth`).toBe(true);
    }
  });

  it("mentions rule names its data source: hidden when either the BE list or the content slice is real", () => {
    // Slices are cumulative in practice (activity implies content); the rule must not rely on that
    expect(CAPABILITY_RULES.mentionNotifications(new Set(["auth", "activity"]))).toBe(false);
    expect(CAPABILITY_RULES.mentionNotifications(new Set(["auth", "content"]))).toBe(false);
    expect(CAPABILITY_RULES.mentionNotifications(new Set(["auth"]))).toBe(true);
    expect(CAPABILITY_RULES.mentionNotifications(new Set())).toBe(true);
  });

  it("rules derive only from the parsed slice set", () => {
    expect(CAPABILITY_RULES.search(new Set(["auth", "content"]))).toBe(false);
    expect(CAPABILITY_RULES.search(new Set(["auth"]))).toBe(true);
    expect(CAPABILITY_RULES.followLists(new Set(["auth", "content", "graph"]))).toBe(true);
  });
});
