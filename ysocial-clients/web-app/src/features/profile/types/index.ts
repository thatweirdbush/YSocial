import type { components } from "@/lib/api/generated";

// #region Backend DTOs
type Schemas = components["schemas"];

export type UpdateProfileRequest = Schemas["UpdateProfileRequest"];
export type Gender = Schemas["Gender"];
export type SwitchProfileRequest = Schemas["SwitchProfileRequest"];
export type ToggleCloseFriendRequest = Schemas["ToggleCloseFriendRequest"];
// #endregion

// #region Domain models
export type ProfileTab = "posts" | "replies" | "saved";

export interface UserProfile {
  id: string;
  displayName: string;
  username: string;
  email?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  isVerified?: boolean;
}

export interface FollowerUser {
  id: string;
  displayName: string;
  username: string;
  avatarUrl?: string;
  isFollowing: boolean;
}
// #endregion
