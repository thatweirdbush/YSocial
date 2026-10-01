---
module: Frontend Roadmap (FE-only, mock data)
updated: 2026-10-01
---

# YSocial Frontend — Audit & Roadmap (FE-only, mock data)

## Context
Chồng iu cần rà soát hiện trạng FE YSocial và một lộ trình **đầy đủ** các tính năng còn thiếu so với Threads/X. Phạm vi: UI/UX, components, layouts, Zustand. **Không kết nối backend/API/DB** — mọi dữ liệu render bằng mock trong FE.

**Phân loại theo `brainstorming`:** đây là việc **Architectural** (nhiều subsystem độc lập) → plan này là **roadmap + phân rã sub-project**. Mỗi sub-project khi bắt đầu sẽ đi đủ vòng: brainstorm → spec `docs/specs/YYYY-MM-DD-<topic>-design.md` → `writing-plans` → thực thi (subagent-driven / executing-plans) → review → verify.

**Skills đã áp dụng cho plan:** using-superpowers, brainstorming, writing-plans, concise-planning, kaizen, frontend-design, ui-ux-pro-max, nextjs-best-practices, react-best-practices, react-patterns, scroll-experience, tailwind-patterns, seo-audit, lint-and-validate, verification-before-completion, test-driven-development.

---

## Bước 1 — Hiện trạng

| Route | Feature | Trạng thái |
|---|---|---|
| `/` | `posts` — `PostFeed` (infinite query + mock fallback), `PostCard` (like/bookmark/share, menu, image carousel + fullscreen), skeleton | ✅ |
| dialog/inline | `posts` — `PostCreatorCore/Dialog/Feed`, `post-draft-store` (localStorage), audience picker, discard dialog | ✅ |
| `/login`, `/register` | `auth` — multi-step login, forgot/reset OTP, `auth-store` | ✅ |
| `/@username` | `profile` — header, tabs, edit dialog, followers dialog, bio parser | ⚠️ SSR `fetch` backend thật (`app/[@username]/page.tsx`) → **chết khi không có BE**; tab Replies là placeholder |
| `/notifications` | `notifications` — list like/follow/reply, mock `INITIAL_NOTIFICATIONS` | ✅ cơ bản |
| `/saved` | `saved` — collections, manage mode, drag sort, bulk unsave (mock) | ✅ |
| Layout | `main-layout` (sidebar collapse, bottom nav mobile, dropdown: profile/language/theme/logout), right sidebar (search widget, trending, follow suggestions — tĩnh) | ✅ |

**Lỗ hổng kỹ thuật phát hiện:**
1. Nav `/search` → **404**. Nút **Comment** (`post-card.tsx:496`) không có handler; không có `/posts/[id]`.
2. Like/bookmark là state cục bộ từng `PostCard` → feed/profile/saved **không đồng bộ**.
3. Không có `loading.tsx` / `error.tsx` / `not-found.tsx` cho route nào (vi phạm `nextjs-best-practices`).
4. **Không có test runner** (không Vitest/Jest, không script `typecheck`) → chưa thể làm TDD như skill bắt buộc.
5. Nhiều `t("..." as any)` trong `saved-list.tsx` → i18n keys thiếu/không typed.
6. Mock rải rác trong từng component (`post-feed.tsx`, `notification-container.tsx`, `saved-list.tsx`) → không có nguồn dữ liệu chung.

---

## Bước 2 & 3 — Checklist tính năng (ưu tiên cao → thấp)

### Phase 0 — Foundation (bắt buộc trước, chặn mọi phase sau)
- [ ] **F0.1 Test & validate infra:** Vitest + React Testing Library + jsdom, script `test` & `typecheck` (cần chồng iu duyệt cài devDependencies).
- [ ] **F0.2 Mock data layer:** seed users/posts/replies/notifications/conversations tập trung; helper `mockDelay()` để hiển thị skeleton thật; ID ổn định.
- [ ] **F0.3 Normalized post store (Zustand):** `Record<id, PostItem>` + selectors `usePost(id)` → like/bookmark/reply đồng bộ mọi nơi, toggle O(1), không re-render list.
- [ ] **F0.4 Route shells:** `loading.tsx` (skeleton khớp kích thước, chống CLS), `error.tsx` (retry), `not-found.tsx` (global + profile/post).
- [ ] **F0.5 Shared `EmptyState`** (`components/shared/empty-state.tsx`): icon Lucide + message Gen Z + CTA — chuẩn hoá cho mọi list.
- [ ] **F0.6 Profile chạy bằng mock** (bỏ SSR fetch BE thật, giữ `generateMetadata`).

### Phase 1 — Core content loop (P0)
- [ ] **1.1 Post Detail & Reply Thread** `/posts/[id]` — *ưu tiên #1, xem Bước 4*.
- [ ] **1.2 Search / Explore** `/search?q=` — tabs Top / Người dùng / Bài viết / Hashtag, recent searches (localStorage), gợi ý debounce, highlight từ khoá; `SearchWidget` điều hướng sang đây.
- [ ] **1.3 Hashtag page** `/tags/[tag]` — bio parser, trending, nội dung post linkify → đích.
- [ ] **1.4 Feed tabs** "Dành cho bạn / Đang theo dõi" + nút "Có bài mới" (giả lập push mỗi N giây).
- [ ] **1.5 Owner actions trên post:** Sửa (inline editor + nhãn "đã chỉnh sửa"), Xoá (confirm + undo toast), Ghim lên profile, Ẩn số like.
- [ ] **1.6 User hover card** (Radix HoverCard): avatar, bio, follower count, nút Follow — trên tên/avatar trong `PostCard`.

### Phase 2 — Profile & Social graph (P1)
- [ ] **2.1 Profile tabs đầy đủ:** Threads / Replies / Media (grid) / Reposts / Saved (self).
- [ ] **2.2 Followers / Following pages** `/@username/followers|following` (thay/kèm dialog), search trong list.
- [ ] **2.3 Private account & Follow requests:** trạng thái Pending (khớp spec BE), màn duyệt yêu cầu.
- [ ] **2.4 Close Friends manager:** danh sách + toggle (khớp `ToggleCloseFriendRequest`), badge vòng xanh trên post close-friends.
- [ ] **2.5 Block / Mute / Restrict:** từ menu `PostCard` (đang chỉ toast) → thật sự ẩn nội dung trong store, danh sách quản lý trong Settings.
- [ ] **2.6 Share profile:** copy link + QR code dialog.
- [ ] **2.7 Multi-profile switcher** (khớp `SwitchProfileRequest`): chuyển tài khoản trong dropdown sidebar.

### Phase 3 — Notifications & Activity (P1)
- [ ] **3.1 Filter tabs:** Tất cả / Lượt nhắc / Trả lời / Theo dõi / Lượt thích; group "X và 12 người khác đã thích".
- [ ] **3.2 Unread badge** trên nav (Zustand `notification-store`), mark-all-read, mark-on-view.
- [ ] **3.3 Realtime giả lập:** timer bắn notification mock + toast (chuẩn bị chỗ cắm SignalR sau).
- [ ] **3.4 Notification settings** (bật/tắt từng loại) — dùng chung store với Settings.

### Phase 4 — Settings & Account (P1)
- [ ] **4.1 Settings hub** `/settings` layout 2 cột (desktop) / stack (mobile) với route con:
  - `account` (email, username, ngày sinh, giới tính — khớp `UpdateProfileRequest`), `privacy` (private account, ai được reply/mention), `notifications`, `appearance` (theme, font size, reduced motion — chuyển từ dropdown), `language`, `blocked`, `muted`, `close-friends`, `sessions` (danh sách thiết bị, đăng xuất từ xa — UI), `danger` (deactivate/delete account UI + confirm).
- [ ] **4.2 `settings-store`** persist localStorage, `useShallow` khi chọn nhiều field.

### Phase 5 — Direct Messages (P2)
- [ ] **5.1 Inbox** `/messages` — conversation list (unread, typing, last message), search.
- [ ] **5.2 Chat thread** `/messages/[conversationId]` — bubble group theo thời gian, gửi text/ảnh/emoji, reactions, reply-to, seen status, typing indicator giả lập, auto-scroll + "jump to latest".
- [ ] **5.3 Message requests** (người lạ) & tạo cuộc trò chuyện mới (chọn user).
- [ ] **5.4 Share post qua DM** từ nút Share của `PostCard`.

### Phase 6 — Engagement nâng cao (P2)
- [ ] **6.1 Repost & Quote post** (quote embed card).
- [ ] **6.2 Polls** trong composer + vote UI (kết quả %, hết hạn).
- [ ] **6.3 Composer nâng cao:** autocomplete `@mention` & `#hashtag`, đếm ký tự vòng tròn, multi-post thread ("Thêm vào thread"), link preview card.
- [ ] **6.4 Drafts page** `/drafts` (store đã có) — sửa/xoá/đăng lại.
- [ ] **6.5 Report flow** dialog nhiều bước (thay toast hiện tại).
- [ ] **6.6 Onboarding sau đăng ký:** avatar → sở thích → gợi ý follow → vào feed.

### Phase 7 — Polish & System UX (P3)
- [ ] **7.1 Command palette** (Ctrl/⌘+K) + keyboard shortcuts (`j/k` di chuyển post, `l` like, `n` viết bài, `?` bảng phím tắt).
- [ ] **7.2 Offline banner** + retry (convention Offline Resiliency).
- [ ] **7.3 Scroll restoration** feed ↔ detail (convention), `content-visibility` cho list dài.
- [ ] **7.4 Micro-animations:** like "pop & sparkle", share → ✓, `prefers-reduced-motion`.
- [ ] **7.5 A11y pass:** focus ring, `aria-label` icon button, touch target ≥44px, contrast 4.5:1 cả 2 theme.
- [ ] **7.6 i18n cleanup:** typed keys, bỏ toàn bộ `as any`, đủ vi/en cho mọi feature mới.
- [ ] **7.7 SEO public routes:** `generateMetadata` + OG cho `/posts/[id]`, `/@username`, `/tags/[tag]`.

**Ngoài phạm vi lúc này:** kết nối API/SignalR thật, Communities/Lists, Analytics bài viết, Scheduled posts, PWA.

---

## Bước 4 — Cấu trúc cho ưu tiên #1: Phase 0 (F0.2–F0.3) + 1.1 Post Detail & Reply Thread

Reply = post có `parentId` (giống Threads) → nằm trong feature `posts`, không tạo feature mới.

```
src/app/posts/[id]/
├── page.tsx                       # Thin wrapper: MainLayout + <PostDetailContainer postId>, generateMetadata (từ mock)
├── loading.tsx                    # <PostDetailSkeleton />
└── not-found.tsx                  # EmptyState "Bài viết không tồn tại"

src/components/shared/
└── empty-state.tsx                # (F0.5) dùng chung

src/features/posts/
├── components/
│   ├── post-card.tsx              # (sửa) Comment → router.push(`/posts/${id}`); like/bookmark đọc/ghi qua post-store
│   ├── post-feed.tsx              # (sửa) nguồn dữ liệu = useFeedPostIds() thay vì apiClient
│   └── detail/
│       ├── post-detail-container.tsx   # client container: usePost + useReplyIds, not-found state
│       ├── post-detail-header.tsx      # sticky: Back + "Thread"
│       ├── post-detail-main.tsx        # post gốc mở rộng (timestamp đầy đủ, stats)
│       ├── reply-composer.tsx          # tái dùng PostCreatorCore ("Trả lời @username")
│       ├── reply-list.tsx              # replies + "Xem thêm câu trả lời" (lồng 1 cấp)
│       ├── reply-item.tsx              # PostCard compact + đường kẻ thread
│       └── post-detail-skeleton.tsx    # khớp kích thước thật (CLS)
├── mocks/
│   ├── mock-authors.ts            # PostAuthor[] (seed dùng chung với profile/search sau này)
│   └── mock-posts.ts              # PostItem[] gốc + replies (parentId), ảnh, timestamps
├── store/
│   ├── post-draft-store.ts        # giữ nguyên
│   ├── post-store.ts              # state: posts: Record<id, PostItem>, replyIds: Record<parentId, id[]>, feedIds: id[]
│   │                              # actions: toggleLike, toggleBookmark, addReply, addPost (optimistic, không API)
│   │                              # selectors: usePost(id), useReplyIds(id), useFeedPostIds(), usePostActions()
│   └── post-store.test.ts         # TDD: toggleLike đổi count ±1, addReply tăng commentsCount & prepend vào replyIds, id không tồn tại → no-op
├── types/index.ts                 # PostItem thêm parentId?: string, isEdited?: boolean
└── index.ts                       # export PostDetailContainer
```

**Quyết định thiết kế**
- Store chuẩn hoá `Record<id>` → `PostCard` chỉ subscribe `usePost(id)`; toggle like O(1), không re-render cả feed (`rerender-derived-state`).
- Mock nạp 1 lần khi khởi tạo store (lazy init); về sau thay bằng TanStack Query chỉ cần đổi nguồn trong store/hooks, UI không đổi.
- `page.tsx` giữ Server Component (metadata/OG), phần tương tác là client container (`nextjs-best-practices`).
- Giữ convention cross-feature qua `@/features/posts` / `@/features/posts/types` (đã chốt), chấp nhận lệch nhẹ với rule `bundle-barrel-imports`.
- Design: bám ngôn ngữ hiện có (Luxury Minimal, Zinc, border mảnh) — không dùng thư viện animation/icon mới. `ui-ux-pro-max` script cần Python (máy chưa có) → dùng Quick Reference + Pre-Delivery Checklist của skill.
- i18n: thêm `postDetail.*` vào `lib/locales/vi.json` & `en.json`.

**Tái sử dụng:** `PostCard`, `PostCreatorCore`, `PostSkeletonList`, `MainLayout`, `SafeHydration`, `useTranslation`, shadcn `avatar/button/dropdown-menu/scroll-area/skeleton`.

---

## Verification (mỗi sub-project)
- `npm run test` (store/hook tests viết trước — RED → GREEN), `npm run typecheck`, `npm run lint` — báo đúng kết quả, không thêm lỗi mới.
- `npm run dev` → Browser pane `http://localhost:3000`: bấm Comment → `/posts/[id]`; gửi reply → hiện ngay, `commentsCount` ở feed tăng; like ở detail → quay lại feed đồng bộ; Back giữ scroll; id sai → not-found.
- Kiểm tra 375px / 768px / 1440px, light & dark, keyboard focus (Pre-Delivery Checklist `ui-ux-pro-max`).
- Cập nhật `.context/features/<feature>.md` + `INDEX.md` sau mỗi sub-project (Task Closure Protocol).
