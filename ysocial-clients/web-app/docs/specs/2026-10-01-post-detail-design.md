# Post Detail & Reply Thread — Design Spec

- **Date:** 2026-10-01
- **Status:** Approved in brainstorming (sections 1–3), pending spec review
- **Roadmap:** `.context/features/frontend-roadmap.md` → Phase 0 (F0.1, F0.2, F0.3, F0.5) + Phase 1.1
- **Scope rule:** Frontend only. No backend/API/DB calls in any new or touched flow — all data comes from in-repo mocks.

## 1. Goal

Add a `/posts/[id]` thread page (root post + replies + inline reply composer) and a shared mock-backed data layer so that like / bookmark / reply state is consistent across feed, detail, profile and saved.

## 2. Decisions (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | Test infra | Vitest + React Testing Library + jsdom; add `test` & `typecheck` scripts |
| D2 | Reply composer | Inline under the root post; compact bar expands into `PostCreatorCore mode="reply"` |
| D3 | Nesting | 1 level: each reply shows ≤ 2 child replies + "Xem thêm N câu trả lời" → `/posts/[replyId]` |
| D4 | Data layer | Mock service (async, simulated latency) → normalized Zustand entity store; UI reads store only |

## 3. Global Constraints

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zustand 5, shadcn/Radix, Lucide icons. **No new runtime dependencies.**
- New devDependencies allowed only: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- Files/dirs `kebab-case`; components `PascalCase`; vars/functions `camelCase`; CRLF line endings.
- Types live in `src/features/posts/types/index.ts`; cross-feature imports go through `@/features/posts` or `@/features/posts/types`.
- Pages are thin wrappers; metadata declared in `page.tsx`.
- All user-facing strings via `useTranslation()` with keys in both `src/lib/locales/vi.json` and `en.json` (no `as any`).
- Touch targets ≥ 44px; every icon-only button has `aria-label`; transitions 150–300ms and disabled under `motion-reduce`.
- Content max length: 500 chars (existing `postSchema` in `post-creator-core.tsx`).

## 4. Architecture & Data Flow

```
container ──calls──▶ post-service (mock, async) ──returns──▶ container
    │                                                         │
    └──────────── upsertPosts / setFeedPage / setReplies ◀────┘
                              │
                        post-store (Zustand)
                              │
          usePost(id) / useReplyIds(id) / useFeedIds(tab)
                              │
                    PostCard / ReplyList / PostFeed
```

### 4.1 Types (`features/posts/types/index.ts`)

Add to `PostItem`:
- `parentId?: string` — set for replies.
- `isEdited?: boolean` — reserved for Phase 1.5; not rendered yet.

Add:
```ts
export type FeedTab = "forYou" | "following";
export interface FeedPage { posts: PostItem[]; nextPage?: number }
export interface PostThread {
  post: PostItem;
  parent?: PostItem;
  replies: PostItem[];                          // direct children, newest first
  childReplies: Record<string, PostItem[]>;     // replyId → its direct children (for 1-level nesting)
}
export interface CreatePostInput { content: string; images: string[]; audience: PostAudience }
```

### 4.2 Mocks (`features/posts/mocks/`)

- `mock-authors.ts`: `export const MOCK_AUTHORS: PostAuthor[]` — 8 authors, includes the existing `anquoc.dev` author.
- `mock-posts.ts`: `export const MOCK_POSTS: PostItem[]` — 12 root posts (ids `post-001`…`post-012`) + ~25 replies (ids `reply-<root>-<nn>`, child replies `reply-<root>-<nn>-<mm>`).
  - `post-001` has ≥ 4 direct replies; one of them has 3 child replies (exercises "Xem thêm 1 câu trả lời").
  - `commentsCount` of each post equals its direct reply count in the mock.
  - `createdAt` values are offsets from `MOCK_BASE_DATE` = module load time (seeds always older than session-created posts; ordering deterministic).
- Existing inline `MOCK_FALLBACK_POSTS` in `post-feed.tsx` moves here.

### 4.3 Service (`features/posts/services/post-service.ts`)

```ts
export const FEED_PAGE_SIZE = 10;
export function fetchFeed(tab: FeedTab, page: number): Promise<FeedPage>;
export function fetchPostThread(id: string): Promise<PostThread | null>;
export function createPost(input: CreatePostInput, author: PostAuthor): Promise<PostItem>;
export function createReply(parentId: string, input: CreatePostInput, author: PostAuthor): Promise<PostItem>;
```
- Latency: random 300–600ms via internal `mockDelay()`; tests use fake timers.
- `fetchFeed`: root posts only (`parentId` undefined), newest first; `following` tab returns posts whose author is in a fixed followed set; `nextPage` is `undefined` on the last page.
- `fetchPostThread`: `null` for unknown id; `replies` = direct children, newest first; `childReplies[replyId]` = that reply's direct children, newest first (empty array when none); `parent` set when the post is a reply.
- `createReply`: rejects with `Error` if `parentId` is unknown.
- Dev flag `mockFailureRate` (module constant, default `0`) — when > 0, calls reject randomly with `Error("Mock network failure")`.
- Service keeps its own in-memory copy of mocks so created posts/replies persist for the session.

### 4.4 Store (`features/posts/store/post-store.ts`)

```ts
interface PostStoreState {
  posts: Record<string, PostItem>;
  replyIds: Record<string, string[]>;
  feedIds: Record<FeedTab, string[]>;
  actions: {
    upsertPosts: (posts: PostItem[]) => void;
    setFeedPage: (tab: FeedTab, ids: string[], append: boolean) => void;
    setReplies: (parentId: string, ids: string[]) => void;
    toggleLike: (id: string, seed?: PostItem) => void;
    toggleBookmark: (id: string, seed?: PostItem) => void;
    addReply: (parentId: string, reply: PostItem) => void;
    removeReply: (parentId: string, replyId: string) => void;
    prependPost: (tab: FeedTab, post: PostItem) => void;
  };
}
export const usePostStore;                       // zustand store (exported for tests)
export const usePost: (id: string) => PostItem | undefined;
export const useReplyIds: (parentId: string) => string[];
export const useFeedIds: (tab: FeedTab) => string[];
export const usePostActions: () => PostStoreState["actions"];
```
Rules:
- `toggleLike`: flips `isLikedByCurrentUser`, `likesCount ± 1`, never below 0. If `id` missing and `seed` given → insert seed first, then toggle. If missing and no seed → no-op.
- `toggleBookmark`: same semantics on `isBookmarkedByCurrentUser`.
- `addReply`: upsert reply, prepend id to `replyIds[parentId]` (dedupe), parent `commentsCount + 1` if parent exists.
- `removeReply`: inverse of `addReply` (used for failed optimistic reply), `commentsCount - 1` floored at 0.
- Empty-array selectors return a shared frozen constant to avoid re-render loops.
- No localStorage persistence (mock session state only).

### 4.5 Feed migration (`post-feed.tsx`)

- Remove `useInfiniteQuery`, `useMutation`, `apiClient` usage. Keep tabs, header, IntersectionObserver infinite scroll and skeletons.
- Load via `fetchFeed` → `upsertPosts` + `setFeedPage`; render `useFeedIds(activeTab)`.
- Composer success → `createPost` → `upsertPosts` + `prependPost`.
- `PostCreatorDialog` (sidebar "Tạo bài viết") with no `onPostSubmitted` prop uses the same default (`createPost` → `prependPost("forYou")`); today it silently drops posts.
- Current author comes from `useCurrentAuthor(): PostAuthor` (`features/posts/hooks/use-current-author.ts`), mapping `AuthUser` → `PostAuthor`, fallback `{ id: "me", displayName: "Me", username: "me_ysocial" }`.
- Empty state uses the new shared `EmptyState`.

## 5. Components & UI

### 5.1 Route `src/app/posts/[id]/`

- `page.tsx` (Server Component): `MainLayout` + `<PostDetailContainer postId={id} />`; `generateMetadata` reads `MOCK_POSTS` directly → title `"{displayName} trên YSocial: \"{first 60 chars}…\""`, matching OG title/description; unknown id → title `"Không tìm thấy bài viết • YSocial"`.
- `loading.tsx`: `<PostDetailSkeleton />` inside `MainLayout`.
- `not-found.tsx`: `EmptyState` — title "Bài viết này đã bay màu rồi", action "Về trang chủ" → `/`.
- `error.tsx` (client): `EmptyState` with "Thử lại" → `reset()`.

### 5.2 `features/posts/components/detail/`

| File | Export | Contract |
|---|---|---|
| `post-detail-container.tsx` | `PostDetailContainer({ postId })` | Calls `fetchPostThread`; upserts post/parent/replies/childReplies, `setReplies` for the root and for every entry of `childReplies`. States: loading → skeleton; `null` → `notFound()`; error → `EmptyState` + "Thử lại". Renders header, parent link, main post, composer, reply list. |
| `post-detail-header.tsx` | `PostDetailHeader()` | Sticky `h-14` blur header; Back button (`aria-label`) → `router.back()` if `window.history.length > 1`, else `router.push("/")`; title `t("postDetail.title")`. |
| `post-detail-main.tsx` | `PostDetailMain({ postId })` | `PostCard variant="detail"` reading `usePost(postId)`. |
| `reply-composer.tsx` | `ReplyComposer({ parentId, replyToUsername })` | Collapsed bar "Trả lời @username…" + own avatar → click expands `PostCreatorCore mode="reply" placeholder=…`. Submit: build temp reply → `addReply` → `createReply` → on success replace temp (remove temp + add real); on failure `removeReply` + error toast, content kept. Not authenticated → button `t("postDetail.loginToReply")` → `/login`. |
| `reply-list.tsx` | `ReplyList({ parentId })` | Maps `useReplyIds(parentId)` to `ReplyItem`; empty → `EmptyState` "Chưa ai lên tiếng, mở bát đi!". |
| `reply-item.tsx` | `ReplyItem({ replyId })` | `PostCard variant="compact"` + left thread line; shows first 2 child replies (from `useReplyIds(replyId)`); if more → link "Xem thêm N câu trả lời" → `/posts/{replyId}`. Child replies render without further nesting. |
| `post-detail-skeleton.tsx` | `PostDetailSkeleton()` | Root post + composer bar + 3 reply rows, dimensions matching real components. |

### 5.3 Changes to existing components

- **`post-card.tsx`**
  - New prop `variant?: "feed" | "detail" | "compact"` (default `"feed"`). `detail`: content `text-[17px]`, absolute timestamp (`HH:mm · d thg M, yyyy` via `Intl.DateTimeFormat` with current locale), stats row (likes, replies). `compact`: avatar `h-8 w-8`, no media grid height change.
  - Live data: `const live = usePost(post.id) ?? post`; like/bookmark call `toggleLike(post.id, post)` / `toggleBookmark(post.id, post)`. Remove local `isLiked/likesCount/isBookmarked` state and the `onLikeToggle` / `onBookmarkToggle` props. Keep `onUnsave`, `isSavedPage`, follow props, animations, lightbox.
  - Comment button and content-area click → `router.push(`/posts/${post.id}`)` (not in `detail` variant). Clicks on buttons, links, images and the dropdown call `stopPropagation` / are excluded so they keep their own behavior.
  - Reply posts (`parentId` set) in `detail` variant show "Trả lời @parent" link above content (passed by container via prop `replyToUsername?: string`).
- **`post-creator-core.tsx`**: new props `mode?: "post" | "reply"` (default `"post"`) and `placeholder?: string`. `reply` hides the audience picker and drafts picker; everything else unchanged. No file split in this scope.
- **`components/shared/empty-state.tsx`** (new): `EmptyState({ icon: LucideIcon, title: string, description?: string, action?: ReactNode })`.
- **`features/posts/index.ts`**: export `PostDetailContainer`, `PostDetailSkeleton`.

### 5.4 i18n keys (`postDetail.*`, vi + en)

`title`, `back`, `replyPlaceholder` (with `{username}`), `replyingTo` (with `{username}`), `viewMoreReplies` (with `{n}`), `emptyReplies`, `notFoundTitle`, `backHome`, `loginToReply`, `errorTitle`, `retry`, `replySuccess`, `replyError`, `likes`, `replies`.

Plus `card.like`, `card.comment`, `card.bookmark`, `card.share` — `aria-label`s for PostCard action buttons (currently unlabeled).

### 5.5 Visual language

Existing Luxury Minimal / Zinc style: `border-zinc-200/60 dark:border-zinc-900/60`, blur headers, thread line `w-0.5 bg-zinc-200 dark:bg-zinc-800`. Composer expand `transition-[height] duration-200 motion-reduce:transition-none`. No new animation/icon libraries.

## 6. Error Handling & Edge Cases

| Case | Expected |
|---|---|
| Unknown post id | `notFound()` → `not-found.tsx` |
| Service throws on thread load | Inline `EmptyState` + "Thử lại" re-calls service |
| Unexpected render error | `error.tsx` with `reset()` |
| Reply submit fails | Temp reply removed, `commentsCount` restored, error toast, composer content kept |
| Double submit | Submit disabled while pending; exactly one reply created |
| Empty / > 500 chars reply | Existing Zod validation disables submit |
| Logged out | Thread readable; composer replaced by login button → `/login` |
| Open `/posts/[replyId]` | Reply rendered as thread root with "Trả lời @parent" link → `/posts/{parentId}` |
| Like on detail then Back | Feed shows updated count (shared store) |
| Click image / author / menu in card | Lightbox / profile / menu — no navigation to detail |
| Like on Saved page post not in store | Seeded into store, then toggled |

**Out of scope:** edit/delete reply, repost/quote, scroll restoration (Phase 7.3), migrating profile/saved to the service, persisting created posts across reloads.

## 7. Testing

Vitest config: `vitest.config.mts` (jsdom, `@` alias → `src`, setup file importing `@testing-library/jest-dom/vitest`). Tests colocated as `*.test.ts(x)`.

| File | Cases |
|---|---|
| `store/post-store.test.ts` | like → +1 & flag true; like twice → back to original; likesCount 0 + unlike never negative; missing id + seed → inserted then toggled; missing id no seed → state unchanged; bookmark mirrors like; `addReply` prepends id, dedupes, parent `commentsCount + 1`; `removeReply` restores count, floored at 0; `useReplyIds` for unknown parent returns stable empty array |
| `services/post-service.test.ts` | page 1 returns 10 root posts with `nextPage: 2`; last page `nextPage` undefined; no replies in feed; `fetchPostThread("post-001")` returns direct replies newest first + `childReplies`; unknown id → `null`; reply thread has `parent`; `createReply` unknown parent rejects; created reply appears in next `fetchPostThread` |
| `components/detail/reply-list.test.tsx` | no replies → empty-state text; reply with 3 children → 2 children visible + "Xem thêm 1 câu trả lời" link to `/posts/{replyId}` |
| `components/detail/reply-composer.test.tsx` | logged out → login button; type + submit → reply text appears at top of list and parent count +1; service failure → reply removed, text still in textarea |

## 8. Verification

1. `npm run test` — all new tests observed failing first, then passing.
2. `npm run typecheck` and `npm run lint` — no new errors versus baseline.
3. `npm run dev` + Browser pane: feed Comment → `/posts/post-001`; submit reply → top of list, feed count +1 after Back; like on detail → feed in sync; `/posts/khong-ton-tai` → not-found; open a reply URL → "Trả lời @parent".
4. 375 / 768 / 1440px, light + dark, keyboard Tab focus — `ui-ux-pro-max` Pre-Delivery Checklist.
5. Update `.context/features/post-detail.md`, `.context/INDEX.md`, roadmap item 1.4 ("tabs already exist; only 'new posts' pill missing").
