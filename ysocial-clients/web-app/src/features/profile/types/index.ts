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
