import type { NotificationItemData } from "../types";

/** Seed times are relative to module load, like the post seeds: they always read as "x minutes ago". */
const NOW = Date.now();
const ago = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

// Seed list of the mock adapter (mock user ids, ISO timestamps; the mock adapter sorts newest first)
export const SEED_NOTIFICATIONS: NotificationItemData[] = [
  {
    id: "notif-1",
    kind: "reply",
    user: {
      id: "user-hamy",
      username: "hamy_cute",
      displayName: "Nguyễn Hà My",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80",
      isFollowing: true,
    },
    createdAt: ago(10),
    isRead: false,
    postContentPreview: "Cái này đỉnh thật sự luôn ấy! Lát inbox chỉ mình cách làm nhé.",
    postId: "post-1",
  },
  {
    id: "notif-2",
    kind: "like",
    user: {
      id: "user-minh",
      username: "minh_pvc",
      displayName: "Phan Văn Minh",
      avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: ago(60),
    isRead: false,
    postId: "post-1",
  },
  {
    id: "notif-3",
    kind: "follow",
    user: {
      id: "user-anquoc",
      username: "anquoc.dev",
      displayName: "Trần Anh Quốc",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: ago(3 * 60),
    isRead: true,
  },
  {
    id: "notif-4",
    kind: "reply",
    user: {
      id: "user-nam",
      username: "nam_hoang",
      displayName: "Hoàng Nam",
      avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: ago(24 * 60),
    isRead: true,
    postContentPreview: "Mình đã chạy thử code và kết quả thật sự bất ngờ! Tốc độ nhanh gấp đôi luôn.",
    postId: "post-2",
  },
  {
    id: "notif-5",
    kind: "follow",
    user: {
      id: "user-maichi",
      username: "maichi_ne",
      displayName: "Mai Chi",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
      isFollowing: true,
    },
    createdAt: ago(2 * 24 * 60),
    isRead: true,
  },
  {
    id: "notif-6",
    kind: "like",
    user: {
      id: "user-hamy",
      username: "hamy_cute",
      displayName: "Nguyễn Hà My",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80",
      isFollowing: true,
    },
    createdAt: ago(3 * 24 * 60),
    isRead: true,
    postId: "post-2",
  },
  {
    // Likes post-1 within a day of notif-2: the pair groups ("Phan Van Minh and 1 other liked")
    id: "notif-7",
    kind: "like",
    user: {
      id: "user-nam",
      username: "nam_hoang",
      displayName: "Hoàng Nam",
      avatarUrl: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: ago(5 * 60),
    isRead: false,
    postId: "post-1",
  },
  {
    id: "notif-8",
    kind: "mention",
    user: {
      id: "user-maichi",
      username: "maichi_ne",
      displayName: "Mai Chi",
      avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80",
      isFollowing: true,
    },
    createdAt: ago(2 * 60),
    isRead: false,
    postContentPreview: "Cuối tuần này team mình đi cà phê nhé, tag @you luôn!",
    postId: "post-3",
  },
  {
    id: "notif-9",
    kind: "mention",
    user: {
      id: "user-anquoc",
      username: "anquoc.dev",
      displayName: "Trần Anh Quốc",
      avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=100&q=80",
      isFollowing: false,
    },
    createdAt: ago(26 * 60),
    isRead: true,
    postContentPreview: "Cảm ơn @you đã review PR giúp mình.",
    postId: "post-2",
  },
];
