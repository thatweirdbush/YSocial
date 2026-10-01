export type NotificationKind = "like" | "follow" | "reply";

export interface NotificationUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isFollowing?: boolean;
}

export interface NotificationItemData {
  id: string;
  kind: NotificationKind;
  user: NotificationUser;
  createdAt: string;
  isRead: boolean;
  postContentPreview?: string; // Used in Replies
  postId?: string;             // Used to link to post
}
