import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type NotificationDto = Schemas["NotificationDto"];
export type NotificationPageDto = Schemas["NotificationPageDto"];
// #endregion

// #region Domain models
/** `other` = a BE type this FE does not know yet: rendered generic with the BE `message`. */
export type NotificationKind = "like" | "follow" | "reply" | "other";

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
  /** ISO timestamp (real) or a ready display string (mock seed). */
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
