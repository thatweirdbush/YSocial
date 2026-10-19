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
    expect([...ALL].sort()).toEqual([...BE_LESS, ...GRAPH, "muteUi"].sort());
  });

  it.each(STATES)("slices %j", (slices, content, graph, activity) => {
    setRealSlices(slices);
    for (const capability of BE_LESS) expect(hasCapability(capability), capability).toBe(!content);
    for (const capability of GRAPH) expect(hasCapability(capability), capability).toBe(!content || graph);
    expect(hasCapability("muteUi")).toBe(!content || activity);
  });

  it("rules derive only from the parsed slice set", () => {
    expect(CAPABILITY_RULES.search(new Set(["auth", "content"]))).toBe(false);
    expect(CAPABILITY_RULES.search(new Set(["auth"]))).toBe(true);
    expect(CAPABILITY_RULES.followLists(new Set(["auth", "content", "graph"]))).toBe(true);
  });
});
