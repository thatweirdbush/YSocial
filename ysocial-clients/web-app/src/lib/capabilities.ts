import { type ApiSlice, parseRealSlices } from "./api-config";

/** Features that exist only on one side while slices switch to the real BE (roadmap Phase C coexistence table). */
export type Capability =
  | "search"
  | "tags"
  | "trending"
  | "suggestions"
  | "pin"
  | "hideLikeCount"
  | "multiImage"
  | "postAudience"
  | "profileRepliesMedia"
  | "newPostsPill"
  | "closeFriendsBadge"
  | "followingTabGuest"
  | "followLists"
  | "blockUi"
  | "closeFriendsUi"
  | "privacyUi"
  | "followRequestsUi"
  | "muteUi"
  | "notificationSettings"
  | "mentionNotifications"
  | "accountUi"
  | "profileSwitcher";

type Slices = ReadonlySet<ApiSlice>;

/** BE-less: off whenever content is real (also once every slice is real, until the BE grows the endpoint). */
const unlessContentReal = (slices: Slices): boolean => !slices.has("content");
/** Graph features: off while content is real & graph is still mock (mock ids would reach real routes). */
const unlessGraphPending = (slices: Slices): boolean => !slices.has("content") || slices.has("graph");

/** Needs a real identity (account, sessions, danger, profile switcher have no mock adapter): follows the auth slice only. */
const whenAuthReal = (slices: Slices): boolean => slices.has("auth");

export const CAPABILITY_RULES: Record<Capability, (slices: Slices) => boolean> = {
  search: unlessContentReal,
  tags: unlessContentReal,
  trending: unlessContentReal,
  suggestions: unlessContentReal,
  pin: unlessContentReal,
  hideLikeCount: unlessContentReal,
  multiImage: unlessContentReal,
  postAudience: unlessContentReal,
  profileRepliesMedia: unlessContentReal,
  newPostsPill: unlessContentReal,
  closeFriendsBadge: unlessContentReal,
  followingTabGuest: unlessContentReal,
  followLists: unlessGraphPending,
  blockUi: unlessGraphPending,
  closeFriendsUi: unlessGraphPending,
  privacyUi: unlessGraphPending,
  followRequestsUi: unlessGraphPending,
  // Mute needs the activity slice: a local-only mute would not affect the real feed
  muteUi: (slices) => !slices.has("content") || slices.has("activity"),
  // Preferences are written to the activity BE: off while content is real & activity is still mock (a local-only
  // switch would change nothing real), same rule as mute
  notificationSettings: (slices) => !slices.has("content") || slices.has("activity"),
  // Mention notifications exist only in the mock seed (BE has no mention model): on only when NEITHER the activity list
  // (real BE, no mentions) NOR content (seed hidden) is real
  mentionNotifications: (slices) => !slices.has("activity") && !slices.has("content"),
  accountUi: whenAuthReal,
  profileSwitcher: whenAuthReal,
};

/** Whether `capability` is usable with the current `NEXT_PUBLIC_REAL_API_SLICES` (read per call). */
export function hasCapability(capability: Capability): boolean {
  return CAPABILITY_RULES[capability](new Set(parseRealSlices(process.env.NEXT_PUBLIC_REAL_API_SLICES)));
}
