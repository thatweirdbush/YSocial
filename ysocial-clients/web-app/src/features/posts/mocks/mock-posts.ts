import { SEED_AUTHORS } from "@/mocks/seed-authors";
import type { HashtagStat, PostItem } from "../types";
import { collectTagStats, tagKey } from "../utils/hashtags";

/**
 * Reference time for seed timestamps: module load time, so seeds always read as "x minutes ago"
 * and stay older than posts created during the session. Ordering is deterministic; absolute values are not.
 */
export const MOCK_BASE_DATE = new Date().toISOString();

const image = (photo: string) => `https://images.unsplash.com/${photo}?auto=format&fit=crop&w=800&q=80`;

type RawPost = Omit<PostItem, "user" | "createdAt" | "commentsCount" | "isLikedByCurrentUser" | "isBookmarkedByCurrentUser"> & {
  author: number;
  minutesAgo: number;
  liked?: boolean;
  bookmarked?: boolean;
};

const RAW_POSTS: RawPost[] = [
  // #region Root posts
  { id: "post-001", author: 0, minutesAgo: 10, likesCount: 128, liked: false, imageUrl: image("photo-1618005182384-a83a8bd57fbe"),
    content: "Chào mừng các bạn đến với YSocial! Giao diện theo phong cách Luxury Minimalist lấy cảm hứng từ Threads và X. Thử Like (Heart Pop) và Share (Rotate Copy) nhé! ✨ #YSocial #Minimalism" },
  { id: "post-002", author: 1, minutesAgo: 45, likesCount: 42, liked: true, bookmarked: true,
    content: "Next.js App Router đi cùng Tailwind CSS v4 thật sự quá mượt. Mọi người thích Server hay Client Components cho feed hơn? #NextJS" },
  { id: "post-003", author: 2, minutesAgo: 180, likesCount: 89, imageUrl: image("photo-1507525428034-b723cf961d3e"),
    content: "Tối giản không phải là thiếu đi thứ gì đó. Nó là vừa đủ mọi thứ. #Minimalism" },
  { id: "post-004", author: 3, minutesAgo: 240, likesCount: 56,
    imageUrls: [image("photo-1558655146-9f40138edfeb"), image("photo-1561070791-2526d30994b5")],
    content: "Moodboard tuần này: zinc, kính mờ và thật nhiều khoảng trắng. Bạn chọn tấm nào? #Design #Minimalism" },
  { id: "post-005", author: 4, minutesAgo: 300, likesCount: 31,
    content: "Hôm nay refactor xong toàn bộ types theo Vertical Slice. Import chéo giữa các feature giờ sạch như lau ly 🧼 cc @anquoc.dev #VietCode" },
  { id: "post-006", author: 5, minutesAgo: 420, likesCount: 214, bookmarked: true, imageUrl: image("photo-1500530855697-b586d89ba3ee"),
    content: "Bình minh ở Đà Lạt sáng nay. Không filter, chỉ có sương và một chút cà phê. #ĐàLạt" },
  { id: "post-007", author: 6, minutesAgo: 600, likesCount: 12,
    content: "Có ai dùng Zustand với useShallow chưa? Re-render giảm thấy rõ luôn. #Zustand #NextJS" },
  { id: "post-008", author: 7, minutesAgo: 780, likesCount: 67,
    content: "Viết mỗi ngày 300 chữ, sau 30 ngày mình nhận ra suy nghĩ rõ ràng hơn hẳn. Thử thách tháng 10 ai chơi không?" },
  { id: "post-009", author: 2, minutesAgo: 1_020, likesCount: 45,
    content: "Skeleton phải khớp kích thước thật của card. CLS = 0 hoặc không là gì cả. #NextJS" },
  { id: "post-010", author: 1, minutesAgo: 1_440, likesCount: 23, bookmarked: true, imageUrl: image("photo-1517694712202-14dd9538aa97"),
    content: "Setup bàn làm việc mới. Màn hình dọc cho code review là chân ái." },
  { id: "post-011", author: 3, minutesAgo: 2_000, likesCount: 9,
    content: "Dark mode không chỉ là đảo màu. Độ tương phản 4.5:1 vẫn là luật. #DarkMode #Design" },
  { id: "post-012", author: 5, minutesAgo: 2_880, likesCount: 150, imageUrl: image("photo-1469474968028-56623f02e42e"),
    content: "Một tuần trekking, 0 thông báo, 100% bình yên. Giờ quay lại feed thôi 🏔️ #dalat" },
  // #endregion

  // #region Replies — post-001 thread (one reply with 3 children for "view more")
  { id: "reply-001-01", parentId: "post-001", author: 2, minutesAgo: 9, likesCount: 14, content: "Giao diện nhìn sang thật sự! Hiệu ứng Like rất đã tay." },
  { id: "reply-001-02", parentId: "post-001", author: 3, minutesAgo: 8, likesCount: 22, liked: true, content: "Cho mình hỏi palette màu chính là zinc hay slate vậy?" },
  { id: "reply-001-02-01", parentId: "reply-001-02", author: 0, minutesAgo: 7, likesCount: 6, content: "Zinc bạn nhé, cả light lẫn dark mode." },
  { id: "reply-001-02-02", parentId: "reply-001-02", author: 3, minutesAgo: 6, likesCount: 2, content: "Cảm ơn ad, đúng gu mình luôn 💜" },
  { id: "reply-001-02-03", parentId: "reply-001-02", author: 4, minutesAgo: 5, likesCount: 1, content: "Zinc + border mảnh là combo bất bại." },
  { id: "reply-001-03", parentId: "post-001", author: 5, minutesAgo: 6, likesCount: 3, content: "Đã share cho team design rồi nha." },
  { id: "reply-001-04", parentId: "post-001", author: 6, minutesAgo: 4, likesCount: 0, content: "Khi nào có app mobile vậy ad?" },
  { id: "reply-001-04-01", parentId: "reply-001-04", author: 0, minutesAgo: 3, likesCount: 4, content: "Đang trong roadmap, sớm thôi!" },
  { id: "reply-001-05", parentId: "post-001", author: 7, minutesAgo: 2, likesCount: 1, content: "Thread đầu tiên mình comment trên YSocial 🎉" },
  // #endregion

  // #region Replies — other posts
  { id: "reply-002-01", parentId: "post-002", author: 2, minutesAgo: 40, likesCount: 5, content: "Server cho phần khung, Client cho phần tương tác." },
  { id: "reply-002-02", parentId: "post-002", author: 4, minutesAgo: 35, likesCount: 2, content: "Feed riêng tư thì CSR là hợp lý nhất." },
  { id: "reply-002-03", parentId: "post-002", author: 6, minutesAgo: 30, likesCount: 0, content: "Mình vẫn mê TanStack Query cho infinite scroll." },
  { id: "reply-003-01", parentId: "post-003", author: 1, minutesAgo: 170, likesCount: 7, content: "Câu này nên in lên tường văn phòng." },
  { id: "reply-003-02", parentId: "post-003", author: 7, minutesAgo: 150, likesCount: 3, content: "Đúng chất Luxury Minimal luôn." },
  { id: "reply-004-01", parentId: "post-004", author: 5, minutesAgo: 230, likesCount: 4, content: "Tấm thứ hai! Ánh sáng đẹp quá." },
  { id: "reply-004-02", parentId: "post-004", author: 0, minutesAgo: 200, likesCount: 2, content: "Kính mờ mà lạm dụng là mất contrast đó nha." },
  { id: "reply-005-01", parentId: "post-005", author: 2, minutesAgo: 290, likesCount: 3, content: "Vertical Slice đúng là cứu cánh khi project lớn dần." },
  { id: "reply-005-02", parentId: "post-005", author: 3, minutesAgo: 280, likesCount: 1, content: "Có share convention không bạn ơi?" },
  { id: "reply-006-01", parentId: "post-006", author: 7, minutesAgo: 400, likesCount: 11, content: "Đẹp như tranh, cho mình xin địa điểm với." },
  { id: "reply-008-01", parentId: "post-008", author: 4, minutesAgo: 700, likesCount: 2, content: "Mình tham gia! Ngày 1 bắt đầu từ hôm nay." },
  { id: "reply-008-02", parentId: "post-008", author: 1, minutesAgo: 650, likesCount: 1, content: "300 chữ hơi nhiều, mình thử 150 trước nha." },
  { id: "reply-010-01", parentId: "post-010", author: 6, minutesAgo: 1_400, likesCount: 0, content: "Bàn phím gì vậy bạn?" },
  { id: "reply-012-01", parentId: "post-012", author: 3, minutesAgo: 2_800, likesCount: 9, content: "Ghen tị ghê, cung nào vậy?" },
  { id: "reply-012-02", parentId: "post-012", author: 2, minutesAgo: 2_700, likesCount: 4, content: "Detox mạng xã hội trên mạng xã hội, thật là meta 😄" },
  // #endregion
];

const baseTime = Date.parse(MOCK_BASE_DATE);

const replyCounts = RAW_POSTS.reduce<Record<string, number>>((counts, raw) => {
  if (raw.parentId) counts[raw.parentId] = (counts[raw.parentId] ?? 0) + 1;
  return counts;
}, {});

export const MOCK_POSTS: PostItem[] = RAW_POSTS.map(({ author, minutesAgo, liked, bookmarked, ...rest }) => ({
  ...rest,
  user: SEED_AUTHORS[author],
  createdAt: new Date(baseTime - minutesAgo * 60_000).toISOString(),
  commentsCount: replyCounts[rest.id] ?? 0,
  isLikedByCurrentUser: liked ?? false,
  isBookmarkedByCurrentUser: bookmarked ?? false,
}));

/** Synchronous seed lookup for server-side metadata (session-created posts are client-only). */
export const getMockPostById = (id: string): PostItem | undefined => MOCK_POSTS.find((post) => post.id === id);

let seedTagStats: Map<string, HashtagStat> | undefined;

/** Synchronous seed hashtag stat for server-side metadata; case & diacritics insensitive. */
export const getMockTagStat = (tag: string): HashtagStat | undefined => {
  seedTagStats ??= collectTagStats(MOCK_POSTS);
  return seedTagStats.get(tagKey(tag));
};
