# Post Detail & Reply Thread Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/posts/[id]` (root post + 1-level reply thread + inline reply composer) on top of a mock service + normalized Zustand post store shared by feed and detail.

**Architecture:** `post-service.ts` (async, in-memory mocks, simulated latency) is the only data source; containers call it and write results into `post-store.ts` (`Record<id, PostItem>` + id lists). `PostCard`, `PostFeed` and the detail components read the store via narrow selectors, so like/bookmark/reply stay in sync everywhere.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand 5, Tailwind v4, shadcn/Radix, Lucide, Vitest + React Testing Library + jsdom.

**Spec:** `docs/specs/2026-10-01-post-detail-design.md`

All paths below are relative to `ysocial-clients/web-app/`.

## Global Constraints

- No backend/API calls in any new or touched flow (`apiClient` must not be imported by new files; removed from `post-feed.tsx`).
- No new runtime dependencies. devDependencies allowed: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `jsdom`.
- Files `kebab-case`, components `PascalCase`, CRLF line endings, `import type` for type-only imports.
- Types only in `src/features/posts/types/index.ts`; cross-feature imports via `@/features/posts` or `@/features/posts/types`.
- All strings through `useTranslation()`; every new key exists in both `vi.json` and `en.json`; no `as any` on `t()`.
- Touch targets ≥ 44px; icon-only buttons have `aria-label`; transitions 150–300ms with `motion-reduce:transition-none`.
- Reply max length 500 chars (existing `postSchema`).
- Lint/typecheck baseline: `npx tsc --noEmit` currently exits 0; ESLint has pre-existing errors — **no new errors** in touched files.

## Review Focus

1. **Double submit of a reply** → exactly one reply, counter +1 once. Pinned in Task 10 (`submits once when clicked twice`).
2. **Reply failure keeps typed content** → `PostCreatorCore` only resets on success, so `ReplyComposer` must rethrow after rollback. Pinned in Task 10 (`rolls back and keeps text on failure`).
3. **Clicking image / author / menu inside a card must not navigate to detail** → Pinned in Task 6 (`does not navigate when clicking author link`).
4. **Stable empty selectors** → `useReplyIds("unknown")` must return the same array reference across renders (else infinite re-render). Pinned in Task 4.
5. **Like on a post not in the store (Saved page)** → seeded then toggled. Pinned in Task 4 (`seeds missing post`).

---

### Task 1: Test & validation infrastructure

**Files:**
- Modify: `package.json` (devDependencies + scripts)
- Create: `vitest.config.mts`, `vitest.setup.ts`, `src/lib/sanity.test.ts`

**Interfaces:**
- Produces: `npm run test` (= `vitest run`), `npm run test:watch` (= `vitest`), `npm run typecheck` (= `tsc --noEmit`).

- [ ] **Step 1:** `npm i -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom`
- [ ] **Step 2:** Create `vitest.config.mts`: `plugins: [react()]`, `test.environment: "jsdom"`, `test.setupFiles: ["./vitest.setup.ts"]`, `test.include: ["src/**/*.test.{ts,tsx}"]`, `resolve.alias: { "@": path.resolve(__dirname, "src") }`.
- [ ] **Step 3:** `vitest.setup.ts`: `import "@testing-library/jest-dom/vitest";` plus `afterEach(cleanup)`.
- [ ] **Step 4:** Add scripts `test`, `test:watch`, `typecheck` to `package.json`.
- [ ] **Step 5:** Write `src/lib/sanity.test.ts`: `expect(1 + 1).toBe(2)` and a jsdom check `expect(document.createElement("div")).toBeInstanceOf(HTMLElement)`.
- [ ] **Step 6:** Run `npm run test` → 2 passed. Run `npm run typecheck` → exit 0. Then delete `sanity.test.ts`.
- [ ] **Step 7:** Commit `chore(web-app): add vitest + RTL test infrastructure`.

---

### Task 2: Types & mock data

**Files:**
- Modify: `src/features/posts/types/index.ts`
- Create: `src/features/posts/mocks/mock-authors.ts`, `src/features/posts/mocks/mock-posts.ts`, `src/features/posts/mocks/mock-posts.test.ts`

**Interfaces:**
- Produces (types): `PostItem.parentId?: string`, `PostItem.isEdited?: boolean`, `FeedTab = "forYou" | "following"`, `FeedPage { posts: PostItem[]; nextPage?: number }`, `PostThread { post; parent?; replies: PostItem[]; childReplies: Record<string, PostItem[]> }`, `CreatePostInput { content: string; images: string[]; audience: PostAudience }`.
- Produces (data): `MOCK_AUTHORS: PostAuthor[]` (8), `MOCK_FOLLOWED_AUTHOR_IDS: string[]` (3 author ids), `MOCK_BASE_DATE = "2026-10-01T09:00:00.000Z"`, `MOCK_POSTS: PostItem[]`.

- [ ] **Step 1: Write failing test** `mock-posts.test.ts`:
  - 12 root posts with ids `post-001`…`post-012`.
  - every reply's `parentId` exists in `MOCK_POSTS`.
  - for every post, `commentsCount === MOCK_POSTS.filter(p => p.parentId === post.id).length`.
  - `post-001` has ≥ 4 direct replies and one of them has exactly 3 children.
  - all ids unique.
- [ ] **Step 2:** `npm run test -- mock-posts` → FAIL (module not found).
- [ ] **Step 3:** Add types; author `MOCK_AUTHORS` (include existing `anquoc.dev` from `post-feed.tsx`); author `MOCK_POSTS` (~25 replies, ids `reply-<root>-<nn>` / `reply-<root>-<nn>-<mm>`, `createdAt` offsets from `MOCK_BASE_DATE`, Vietnamese content, some with `imageUrls` reused from current `post-feed.tsx` mocks).
- [ ] **Step 4:** `npm run test -- mock-posts` → PASS.
- [ ] **Step 5:** Commit `feat(posts): add thread types and mock dataset`.

---

### Task 3: Mock post service

**Files:**
- Create: `src/features/posts/services/post-service.ts`, `src/features/posts/services/post-service.test.ts`

**Interfaces:**
- Consumes: Task 2 types/mocks.
- Produces:
  ```ts
  export const FEED_PAGE_SIZE = 10;
  export function fetchFeed(tab: FeedTab, page: number): Promise<FeedPage>;
  export function fetchPostThread(id: string): Promise<PostThread | null>;
  export function createPost(input: CreatePostInput, author: PostAuthor): Promise<PostItem>;
  export function createReply(parentId: string, input: CreatePostInput, author: PostAuthor): Promise<PostItem>;
  export function __resetMockDb(): void; // test-only: restore in-memory copy from MOCK_POSTS
  ```

- [ ] **Step 1: Write failing tests** (use `vi.useFakeTimers()` + `vi.runAllTimersAsync()`; `beforeEach(__resetMockDb)`):
  - `fetchFeed("forYou", 1)` → 10 posts, all `parentId === undefined`, sorted by `createdAt` desc, `nextPage === 2`.
  - `fetchFeed("forYou", 2)` → 2 posts, `nextPage === undefined`.
  - `fetchFeed("following", 1)` → every author id ∈ `MOCK_FOLLOWED_AUTHOR_IDS`.
  - `fetchPostThread("post-001")` → `post.id === "post-001"`, `replies` direct children newest first, `childReplies[<reply with 3 children>].length === 3`, `parent === undefined`.
  - `fetchPostThread(<a reply id>)` → `parent.id === <its parentId>`.
  - `fetchPostThread("khong-ton-tai")` → `null`.
  - `createReply("nope", …)` rejects with `Error`.
  - after `createReply("post-001", { content: "hi", images: [], audience: "anyone" }, author)` → next `fetchPostThread("post-001")` has `replies[0].content === "hi"` and `post.commentsCount` +1.
  - `createPost` result appears first in `fetchFeed("forYou", 1)`.
- [ ] **Step 2:** `npm run test -- post-service` → FAIL.
- [ ] **Step 3:** Implement. Private `mockDelay()` = `setTimeout` 300–600ms; private `maybeFail()` driven by `const MOCK_FAILURE_RATE = 0`; in-memory `Map<string, PostItem>` cloned from `MOCK_POSTS`; new ids `post-local-${Date.now()}-${counter}`; return copies (never the internal objects).
- [ ] **Step 4:** `npm run test -- post-service` → PASS.
- [ ] **Step 5:** Commit `feat(posts): add mock post service`.

---

### Task 4: Normalized post store

**Files:**
- Create: `src/features/posts/store/post-store.ts`, `src/features/posts/store/post-store.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces (exact names from spec §4.4): `usePostStore`, `usePost(id)`, `useReplyIds(parentId)`, `useFeedIds(tab)`, `usePostActions()`; actions `upsertPosts`, `setFeedPage(tab, ids, append)`, `setReplies(parentId, ids)`, `toggleLike(id, seed?)`, `toggleBookmark(id, seed?)`, `addReply(parentId, reply)`, `removeReply(parentId, replyId)`, `prependPost(tab, post)`. Also `resetPostStore()` for tests.

- [ ] **Step 1: Write failing tests** (operate via `usePostStore.getState().actions`; `beforeEach(resetPostStore)`):
  - `toggleLike` on post with `likesCount: 5, isLikedByCurrentUser: false` → `6, true`; again → `5, false`.
  - post `likesCount: 0, isLikedByCurrentUser: true` → toggle → `0, false` (never negative).
  - `seeds missing post`: `toggleLike("x", seed)` with seed `likesCount: 2, liked false` → stored `3, true`.
  - `toggleLike("missing")` without seed → `getState().posts` deep-equals previous.
  - `toggleBookmark` mirrors the above on `isBookmarkedByCurrentUser`.
  - `addReply("p", r)` → `replyIds.p[0] === r.id`, `posts.p.commentsCount` +1; calling again with same reply → no duplicate id, count unchanged.
  - `removeReply("p", r.id)` → id gone, count −1; on count 0 stays 0.
  - `setFeedPage("forYou", ["a","b"], false)` then `(["c"], true)` → `["a","b","c"]`; `prependPost("forYou", post)` → id first and post upserted.
  - `renderHook(() => useReplyIds("unknown"))` rerendered twice → `result.current` same reference (`toBe`).
- [ ] **Step 2:** `npm run test -- post-store` → FAIL.
- [ ] **Step 3:** Implement with `create()`; module-level `const EMPTY_IDS: readonly string[] = Object.freeze([])`; selectors return `state.replyIds[id] ?? EMPTY_IDS`; state and `actions` separated (convention).
- [ ] **Step 4:** `npm run test -- post-store` → PASS.
- [ ] **Step 5:** Commit `feat(posts): add normalized post store`.

---

### Task 5: Shared EmptyState & i18n keys

**Files:**
- Create: `src/components/shared/empty-state.tsx`, `src/components/shared/empty-state.test.tsx`
- Modify: `src/lib/locales/vi.json`, `src/lib/locales/en.json`, `src/hooks/use-translation.ts`

**Interfaces:**
- Produces: `EmptyState({ icon: LucideIcon; title: string; description?: string; action?: ReactNode })`; `TranslationKey` union gains `` `postDetail.${keyof typeof vi.postDetail}` ``.
- Keys (spec §5.4): `title, back, replyPlaceholder{username}, replyingTo{username}, viewMoreReplies{n}, emptyReplies, notFoundTitle, backHome, loginToReply, errorTitle, retry, replySuccess, replyError, likes, replies`.
  - vi values: "Thread", "Quay lại", "Trả lời @{username}…", "Trả lời @{username}", "Xem thêm {n} câu trả lời", "Chưa ai lên tiếng, mở bát đi!", "Bài viết này đã bay màu rồi", "Về trang chủ", "Đăng nhập để trả lời", "Có gì đó sai sai…", "Thử lại", "Đã gửi câu trả lời", "Không gửi được câu trả lời", "lượt thích", "câu trả lời".
- Also add `card.like` ("Thích"), `card.comment` ("Trả lời"), `card.bookmark` ("Lưu"), `card.share` ("Chia sẻ") — used as `aria-label` on PostCard action buttons (none exist today).

- [ ] **Step 1: Write failing test** `empty-state.test.tsx`: renders title, description, and the action node; icon has `aria-hidden="true"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement (layout copied from current empty block in `post-feed.tsx`: `h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-900` icon bubble, `py-20` centered). Add locale keys + union member.
- [ ] **Step 4:** Run test → PASS; `npm run typecheck` → exit 0.
- [ ] **Step 5:** Commit `feat(shared): add EmptyState and postDetail i18n keys`.

---

### Task 6: PostCard reads the store, variants, navigation

**Files:**
- Modify: `src/features/posts/components/post-card.tsx`
- Create: `src/features/posts/components/post-card.test.tsx`

**Interfaces:**
- Consumes: Task 4 store.
- Produces: `PostCard` props = `{ post: PostItem; variant?: "feed" | "detail" | "compact"; replyToUsername?: string; isAuthorFollowing?; onAuthorFollowToggle?; isSavedPage?; onUnsave? }` — **removed** `onLikeToggle`, `onBookmarkToggle`.

- [ ] **Step 1: Write failing tests** (mock `next/navigation` `useRouter` → `{ push: vi.fn(), back: vi.fn() }`; `beforeEach(resetPostStore)`):
  - clicking like button (`getByRole("button", { name: "Thích" })`) on a post not in store → store has post with `likesCount + 1`; rendered count updates.
  - two `PostCard`s with same post id → liking one updates the other's count.
  - clicking comment button → `push("/posts/post-001")`.
  - `does not navigate when clicking author link` → `push` not called with `/posts/...`.
  - `variant="detail"` → comment click does not navigate; renders `t("postDetail.likes")` stats row.
  - `replyToUsername="minh"` with `variant="detail"` → link text "Trả lời @minh".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: `const live = usePost(post.id) ?? post`; replace `isLiked/likesCount/isBookmarked` local state with `live.*` and `toggleLike(post.id, post)` / `toggleBookmark(post.id, post)` (keep animation/toast state); add `aria-label={t("card.like" | "card.comment" | "card.bookmark" | "card.share")}` to the four action buttons; content wrapper `onClick` → navigate when `variant !== "detail"`; `stopPropagation` on author links, media grid, dropdown trigger, action buttons; `detail` variant: `text-[17px]`, absolute time via `Intl.DateTimeFormat(locale === "vi" ? "vi-VN" : "en-US", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short", year: "numeric" })`, stats row; `compact`: avatar `h-8 w-8`.
- [ ] **Step 4:** Run tests → PASS; `npm run typecheck` → exit 0 (fix callers that passed removed props: `post-feed.tsx` handled in Task 7 — temporarily drop the prop there in this task).
- [ ] **Step 5:** Commit `feat(posts): sync PostCard with post store and add variants`.

---

### Task 7: PostFeed uses service + store

**Files:**
- Modify: `src/features/posts/components/post-feed.tsx`, `src/features/posts/components/post-creator-feed.tsx`, `src/features/posts/components/post-creator-dialog.tsx`
- Create: `src/features/posts/components/post-feed.test.tsx`

**Interfaces:**
- Consumes: `fetchFeed`, `createPost` (Task 3), store (Task 4), `EmptyState` (Task 5), `useAuthUser()` from `@/features/auth/store/auth-store`.
- Produces: `PostCreatorFeed` prop changes to `onSuccess?: (input: CreatePostInput) => Promise<void>`.

- [ ] **Step 1: Write failing tests** (fake timers):
  - initial render shows skeleton, then 10 post cards after timers flush.
  - switching to "following" tab renders only followed authors' posts.
  - when service returns no posts (mock `fetchFeed` via `vi.mock` → `{ posts: [] }`) → `t("feed.emptyFeed")` visible.
  - `PostCreatorDialog` without `onPostSubmitted`: submitting "bài mới" → `useFeedIds("forYou")[0]` is the created post (today the sidebar dialog silently drops posts).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: remove `useInfiniteQuery`/`useMutation`/`apiClient`/`MOCK_FALLBACK_POSTS`; local state `{ page, nextPage, isLoading, isFetchingNext }` per tab; load → `upsertPosts` + `setFeedPage`; render `useFeedIds(activeTab)` → `<FeedPostCard id>` small inner component reading `usePost(id)`; refresh button reloads page 1 (`append: false`); composer → `createPost(input, authorFromAuthUser)` → `prependPost`; author fallback when logged out: `{ id: "me", displayName: "Me", username: "me_ysocial" }` — extract as `useCurrentAuthor(): PostAuthor` in `src/features/posts/hooks/use-current-author.ts` (reused by Task 10); `PostCreatorDialog` default submit (when no `onPostSubmitted` prop) → `createPost` + `upsertPosts` + `prependPost("forYou", post)`.
- [ ] **Step 4:** Run tests → PASS; typecheck exit 0.
- [ ] **Step 5:** Commit `refactor(posts): drive feed from mock service and post store`.

---

### Task 8: PostCreatorCore reply mode

**Files:**
- Modify: `src/features/posts/components/post-creator-core.tsx`
- Create: `src/features/posts/components/post-creator-core.test.tsx`

**Interfaces:**
- Produces: `PostCreatorCoreProps` gains `mode?: "post" | "reply"` (default `"post"`) and `placeholder?: string`.

- [ ] **Step 1: Write failing tests:**
  - `mode="reply" placeholder="Trả lời @minh…"` → textarea has that placeholder; audience button (`title`/label `t("creator.audience")`) and drafts button absent.
  - default mode → audience and drafts buttons present.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement with conditional rendering only; no other behavior change.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(posts): add reply mode to PostCreatorCore`.

---

### Task 9: ReplyList & ReplyItem

**Files:**
- Create: `src/features/posts/components/detail/reply-list.tsx`, `reply-item.tsx`, `reply-list.test.tsx`

**Interfaces:**
- Consumes: `useReplyIds`, `usePost` (Task 4), `PostCard variant="compact"` (Task 6), `EmptyState` (Task 5).
- Produces: `ReplyList({ parentId: string })`, `ReplyItem({ replyId: string })`, `export const MAX_INLINE_CHILD_REPLIES = 2`.

- [ ] **Step 1: Write failing tests** (seed store directly):
  - parent with no replies → `t("postDetail.emptyReplies")` text visible.
  - parent with 1 reply that has 3 children → 1 + 2 cards rendered; link "Xem thêm 1 câu trả lời" with `href="/posts/<replyId>"`.
  - reply with 2 children → no "Xem thêm" link.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; thread line `absolute left-[34px] top-14 bottom-0 w-0.5 bg-zinc-200 dark:bg-zinc-800`; children rendered as plain `PostCard variant="compact"` (no further nesting).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(posts): add reply list with 1-level nesting`.

---

### Task 10: ReplyComposer

**Files:**
- Create: `src/features/posts/components/detail/reply-composer.tsx`, `reply-composer.test.tsx`

**Interfaces:**
- Consumes: `createReply` (Task 3), `addReply`/`removeReply`/`upsertPosts` (Task 4), `PostCreatorCore mode="reply"` (Task 8), `useCurrentAuthor` (Task 7), `useIsAuthenticated`.
- Produces: `ReplyComposer({ parentId: string; replyToUsername: string })`.

- [ ] **Step 1: Write failing tests** (render `ReplyComposer` + `ReplyList` together; mock `next/navigation`):
  - logged out (auth store reset) → button `t("postDetail.loginToReply")`; click → `push("/login")`.
  - logged in → click collapsed bar → textarea visible with placeholder "Trả lời @minh…"; type "xin chào" + submit → "xin chào" appears first in list; parent `commentsCount` +1 after timers flush; composer collapses.
  - `submits once when clicked twice` → `createReply` spy called once; count +1.
  - `rolls back and keeps text on failure` → `vi.spyOn(service, "createReply").mockRejectedValue(new Error())` → reply removed, count restored, textarea still contains "xin chào", error toast called.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement: temp reply id `reply-temp-${Date.now()}` → `addReply` → `await createReply` → success: `removeReply(temp)` + `addReply(real)` + success toast + collapse; failure: `removeReply(temp)` + `toast.error(t("postDetail.replyError"))` + **rethrow** so `PostCreatorCore` keeps content. Expand/collapse with `transition-[height] duration-200 motion-reduce:transition-none`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(posts): add inline reply composer`.

---

### Task 11: Detail container, header, skeleton & route

**Files:**
- Create: `src/features/posts/components/detail/post-detail-container.tsx`, `post-detail-header.tsx`, `post-detail-main.tsx`, `post-detail-skeleton.tsx`, `post-detail-container.test.tsx`
- Create: `src/app/posts/[id]/page.tsx`, `loading.tsx`, `not-found.tsx`, `error.tsx`
- Modify: `src/features/posts/index.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `PostDetailContainer({ postId: string })`, `PostDetailSkeleton()`, `PostDetailHeader()`, `PostDetailMain({ postId: string; replyToUsername?: string })`; barrel exports `PostDetailContainer`, `PostDetailSkeleton`.

- [ ] **Step 1: Write failing tests** (`post-detail-container.test.tsx`; mock `next/navigation` with `notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND") })`):
  - shows skeleton first, then root post content and its replies.
  - reply thread (`postId` = a reply id) → "Trả lời @<parent username>" link to `/posts/<parentId>`.
  - unknown id → `notFound` called.
  - service rejects once → `t("postDetail.errorTitle")` + retry button; click retry (service now resolves) → post renders.
  - Back button: `history.length` 1 → `push("/")`; > 1 → `back()`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement components; route `page.tsx` = `MainLayout` + `PostDetailContainer`, `generateMetadata` from `MOCK_POSTS` (title format in spec §5.1); `loading.tsx` = `MainLayout` + `PostDetailSkeleton`; `not-found.tsx` = `EmptyState` + link `/`; `error.tsx` (`"use client"`) = `EmptyState` + `reset()` button.
- [ ] **Step 4:** Run full suite `npm run test` → all PASS; `npm run typecheck` → exit 0; `npx eslint src/features/posts src/app/posts src/components/shared` → no new errors vs baseline.
- [ ] **Step 5:** Commit `feat(posts): add post detail route and thread container`.

---

### Task 12: Runtime verification & context closure

**Files:**
- Modify: `.context/features/frontend-roadmap.md` (item 1.4 wording; tick F0.1–F0.3, F0.5, 1.1), `.context/INDEX.md`
- Create: `.context/features/post-detail.md`

- [ ] **Step 1:** `npm run dev`; in Browser pane verify: feed Comment → `/posts/post-001`; submit reply → top of list; Back → feed count +1; like on detail → feed in sync; `/posts/khong-ton-tai` → not-found; reply URL → "Trả lời @parent"; image click opens lightbox (no navigation).
- [ ] **Step 2:** Check 375 / 768 / 1440px, light + dark, Tab focus order — record results against `ui-ux-pro-max` Pre-Delivery Checklist.
- [ ] **Step 3:** Write `.context/features/post-detail.md` (data flow, store API, design decisions D1–D4, mock id scheme, `seed` rationale, "rethrow to keep composer content" pitfall); update INDEX + roadmap.
- [ ] **Step 4:** Commit `docs(context): document post detail feature`.
