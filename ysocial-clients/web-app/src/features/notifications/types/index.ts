import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type NotificationDto = Schemas["NotificationDto"];
export type NotificationPageDto = Schemas["NotificationPageDto"];
export type NotificationPreferencesDto = Schemas["NotificationPreferencesDto"];
// #endregion

// #region Domain models
/**
 * `mention` exists in the mock seed only (BE has no mention model). `other` = a BE type this FE does not know yet:
 * rendered generic with the BE `message`.
 */
export type NotificationKind = "like" | "follow" | "reply" | "mention" | "other";

/** List tabs: `all` plus one per kind (`mentions` is gated by the `mentionNotifications` capability). */
export type NotificationFilter = "all" | "mentions" | "replies" | "follows" | "likes";

/** Kinds the viewer receives (BE `NotificationPreferencesDto`, all fields required there). */
export interface NotificationPreferences {
  likes: boolean;
  replies: boolean;
  follows: boolean;
}

export interface NotificationUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  /** Mock only: the BE notification carries no follow state, so real items hide the follow-back button. */
  isFollowing?: boolean;
}

export interface NotificationItemData {
  id: string;
  kind: NotificationKind;
  /** BE `type` (`NewFollow`, `FollowRequested`, `FollowAccepted`...) for finer wording than `kind`. */
  type?: string;
  user: NotificationUser;
  /** ISO timestamp (real and mock seed). */
  createdAt: string;
  isRead: boolean;
  postContentPreview?: string; // Used in Replies
  postId?: string;             // Used to link to post
  /** BE message, shown only for `other`. */
  message?: string;
}

export interface NotificationPage {
  items: NotificationItemData[];
  nextPage?: number;
  unreadCount: number;
}
// #endregion
