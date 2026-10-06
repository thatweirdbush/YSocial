# Feed & Post Interaction Implementation Plan

> **Agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`; execute task-by-task. Track steps via `- [x]`.

- **Goal:** ship the "N bài mới" pill (simulated push), owner actions (edit / delete / pin / hide like count) and the author hover card, with follow state single-sourced in `user-store`.
- **Architecture:** mock services (`post-service`, `user-service`, viewer-scoped `src/mocks/follow-graph`) are the ONLY data sources and enforce ownership. `post-store` holds the incoming buffer (per-tab consumed ids), tombstones, pin index and owner-op locks; pure utils (`getPostFeedTabs`, `getPendingFeed`, `getVisibleLikeCount`) carry the rules both service and UI share.
- **Tech stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand 5, Tailwind v4 (+ `tw-animate-css`), shadcn/Radix (`radix-ui`), Lucide, Vitest 4 + RTL + jsdom.
- **Spec:** `docs/specs/2026-10-06-feed-post-interaction-design.md` (section refs below = `§`)
- All paths relative to `ysocial-clients/web-app/`. Branch: `feature/feed-post-interaction`.

## Global Constraints

- NO BE/API calls in new/touched flows; new files MUST NOT import `apiClient`. NO new deps.
- Files `kebab-case`, components `PascalCase`, CRLF line endings, `import type` for type-only imports, sorted imports.
- Domain types ONLY in `features/<feature>/types/index.ts`; cross-feature imports ONLY via `@/features/<feature>` or `@/features/<feature>/types`. NO top-level (module-evaluation) use of another feature's exported values (§4.1).
- All strings via `useTranslation()`, keys in both `vi.json` & `en.json`, NO `as any` in new code or in touched `post-card.tsx`.
- Touch targets >= 44px; icon-only buttons have `aria-label`; transitions 150-300ms + `motion-reduce:*`.
- Store updates touching >1 entity happen in ONE `set()`.
- Baseline (2026-10-06): `npm run test` 180 passed / 28 files; `npm run typecheck` exit 0; `npx eslint src` 64 errors, 25 warnings -> **NO new errors/warnings**; `post-card.tsx` errors (`:90` setState-in-effect, `:442` any) MUST disappear.
- Tests: service tests use fake timers + `settle()`; **NEVER `vi.runAllTimersAsync()` while a `subscribeToNewPosts` listener is active** (self-rescheduling timer -> infinite loop); use `vi.advanceTimersByTimeAsync(ms)`. Async containers MUST await first fetch before test ends.
- Commit messages: Conventional Commits, author = user ONLY, **NO `Co-Authored-By` trailer**.

## Review Focus

1. **React StrictMode double-mount / fast tab visibility toggles** -> subscribe, unsubscribe, subscribe must leave exactly ONE timer and ONE listener. Pinned: Task 4 ("resubscribe -> exactly one timer"), Task 12 ("StrictMode mount subscribes once net").
2. **Double submit** (double-click Delete confirm, Ctrl+Enter twice) -> service called once. Pinned: Task 8 ("double delete confirm calls service once").
3. **Edited content changes hashtags** -> `/tags/<new>` finds the post, old tag no longer does; saved content is trimmed. Pinned: Task 4 ("updatePostContent re-indexes tags & trims").
4. **Page-1 load races the stream** (post arrives while fetch in flight, author not yet in `user-store`) -> post never appears twice (pending + feed). Pinned: Task 5 ("setFeedPage page 1 consumes incoming ids it contains"), Task 5 ("flush skips ids already in feed").
5. **Hover card for unknown / self user** -> `fetchUser` null -> error line + Retry (no crash); self -> no Follow button. Pinned: Task 11.

---

### Task 1: Shared seed authors, viewer-scoped follow graph, `useViewerId`

**Files:**
- Create: `src/mocks/seed-authors.ts`, `src/mocks/follow-graph.ts`, `src/mocks/follow-graph.test.ts`
- Modify: `src/features/posts/mocks/mock-posts.ts`, `src/features/profile/mocks/mock-users.ts`, `src/features/posts/index.ts` (drop `MOCK_AUTHORS`, `MOCK_FOLLOWED_AUTHOR_IDS` exports), `src/features/posts/services/post-service.test.ts` (imports), `src/features/auth/store/auth-store.ts`, `src/features/posts/hooks/use-current-author.ts`
- Delete: `src/features/posts/mocks/mock-authors.ts` (content moved)

**Interfaces:**
- Produces: `SEED_AUTHORS: PostAuthor[]` (same 8 entries as old `MOCK_AUTHORS`), `SEED_FOLLOWED_AUTHOR_IDS: readonly string[]` (`["author-02","author-03","author-06"]`); `getFollowedAuthorIds(viewerId: string): ReadonlySet<string>`, `setFollowed(viewerId: string, authorId: string, following: boolean): void`, `__resetFollowGraph(): void`; `GUEST_VIEWER_ID = "me"`, `useViewerId(): string` (= `useAuthUser()?.id ?? GUEST_VIEWER_ID`) exported from `@/features/auth`.

- [x] **Step 1: Write failing test** `follow-graph.test.ts`: unknown viewer `"v1"` -> set equals seed; `setFollowed("v1","author-01",true)` -> `"v1"` has it, `"v2"` (fresh) does not; `setFollowed("v1","author-02",false)` removes; self-follow `setFollowed("author-01","author-01",true)` ignored; returned set is a copy (mutating it does not change graph); `__resetFollowGraph()` -> `"v1"` back to seed.
- [x] **Step 2:** `npm run test -- follow-graph` -> FAIL (module missing).
- [x] **Step 3:** Implement `Map<string, Set<string>>`, lazily seeded per viewer. Move authors to `seed-authors.ts` (`import type { PostAuthor } from "@/features/posts/types"`). `mock-posts.ts` & `mock-users.ts` import `@/mocks/seed-authors`; `MOCK_USERS[i].isFollowing` stays seed-based for now (Task 3 derives it). `useCurrentAuthor` guest id = `GUEST_VIEWER_ID`.
- [x] **Step 4:** `npm run test` -> all PASS (180 + new); `npm run typecheck` exit 0.
- [x] **Step 5:** Commit `refactor(mocks): shared seed authors & viewer-scoped follow graph`.

---

### Task 2: Domain types & pure rules (feed tabs, pending feed, like visibility)

**Files:**
- Modify: `src/features/posts/types/index.ts`
- Create: `src/features/posts/utils/feed-tabs.ts`, `feed-tabs.test.ts`, `src/features/posts/utils/pending-feed.ts`, `pending-feed.test.ts`, `src/features/posts/utils/like-visibility.ts`, `like-visibility.test.ts`

**Interfaces:**
- Produces (types): `PostItem.isPinned?: boolean`, `PostItem.hideLikeCount?: boolean`; `type OwnerOp = "edit" | "delete" | "pin" | "hideLikeCount"`; `interface PendingFeed { ids: string[]; overflow: boolean }`; `interface IncomingBuffer { incoming: string[]; consumedIncoming: Record<FeedTab, Record<string, true>>; droppedAuthorIds: Record<FeedTab, string[]> }`; `interface RemovalSnapshot { posts: PostItem[]; feedIndex: Partial<Record<FeedTab, number>>; incomingIndex: number; consumedTabs: FeedTab[]; parentId?: string; replyIndex: number; replyIds: Record<string, string[]>; parentDecremented: boolean; wasPinned: boolean }` (root first in `posts`, indexes `-1` when absent).
- Produces (fns): `getPostFeedTabs(post: PostItem, followedAuthorIds: ReadonlySet<string>): FeedTab[]`; `getPendingFeed(posts: Record<string, PostItem>, buffer: IncomingBuffer, tab: FeedTab, followedAuthorIds: ReadonlySet<string>): PendingFeed`; `getVisibleLikeCount(post: PostItem, viewerId: string): number | null`.

- [x] **Step 1: Write failing tests**
  - `feed-tabs`: reply -> `[]`; root by followed author -> `["forYou","following"]`; not followed -> `["forYou"]`.
  - `pending-feed`: incoming `["p3","p2","p1"]` (p2 author followed), nothing consumed -> forYou ids `["p3","p2","p1"]`, following `["p2"]`; consumed forYou `{p3:true}` -> forYou `["p2","p1"]`, following still `["p2"]`; "follow later -> becomes pending": p1 author added to followed set -> following `["p2","p1"]`; id missing from `posts` skipped; overflow: `droppedAuthorIds.following = ["author-01"]` & author-01 not followed -> following overflow `false`, followed -> `true`; forYou overflow `true` iff non-empty.
  - `like-visibility`: not hidden -> count; hidden & viewer = owner -> count; hidden & other viewer -> `null`.
- [x] **Step 2:** `npm run test -- feed-tabs pending-feed like-visibility` -> FAIL.
- [x] **Step 3:** Implement (pure, no store import; O(incoming)).
- [x] **Step 4:** Same command -> PASS.
- [x] **Step 5:** Commit `feat(posts): feed-tab, pending-feed & like-visibility rules`.

---

### Task 3: Viewer-scoped `user-service` & `user-store` (D16)

**Files:**
- Modify: `src/features/profile/types/index.ts`, `src/features/profile/services/user-service.ts` (+ `.test.ts`), `src/features/profile/mocks/mock-users.ts`, `src/features/profile/store/user-store.ts` (+ `.test.ts`), `src/features/profile/index.ts`, `src/features/profile/components/follow-button.tsx` (+ `.test.tsx`), `src/components/layout/right-sidebar/follow-suggestions.tsx`, `src/features/search/components/explore-landing.tsx`, `src/features/search/components/user-result-row.tsx`, `src/features/search/services/search-service.ts` (+ `.test.ts`), `src/features/search/components/search-box.tsx`, `src/features/search/components/search-container.tsx` (+ affected tests)

**Interfaces:**
- Consumes: Task 1 `getFollowedAuthorIds`, `setFollowed`, `useViewerId`.
- Produces (service): `searchUsers(query: string, viewerId: string, limit?: number)`, `fetchSuggestedUsers(limit: number, viewerId: string)`, `fetchUser(id: string, viewerId: string): Promise<UserProfile | null>`, `fetchFollowedIds(viewerId: string): Promise<string[]>`, `setFollow(id: string, following: boolean, viewerId: string): Promise<void>`; `fetchSearch(query, viewerId)`, `fetchSuggestions(query, viewerId)`.
- Produces (types): `UserProfileBase = Omit<UserProfile, "isFollowing">`; `interface ViewerFollows { ids: Record<string, true>; loaded: boolean; version: number }`.
- Produces (store): state `users: Record<string, UserProfileBase>`, `follows: Record<string, ViewerFollows>`; actions `upsertUsers(users: UserProfile[], viewerId: string)`, `toggleFollow(viewerId: string, id: string)`, `setFollowedIds(viewerId: string, ids: string[], sinceVersion: number): boolean`; hooks `useUser(id: string): UserProfile | undefined` (projects current viewer via `useViewerId()`), `useFollowedIds(): { ids: ReadonlySet<string>; loaded: boolean }`; module fns `ensureUser(id: string, viewerId: string): Promise<UserProfile | null>`, `ensureFollowGraph(viewerId: string): Promise<void>`, `getFollowedIds(viewerId: string): { ids: ReadonlySet<string>; loaded: boolean }`. All exported via `@/features/profile` / `@/features/search`.

- [x] **Step 1: Write failing tests**
  - `user-service`: `fetchUser("author-01","v1")` -> `isFollowing` false; `fetchUser("nope","v1")` -> `null`; `fetchFollowedIds("v1")` -> seed ids (sorted compare); `setFollow("author-01", true, "v1")` -> `fetchUser(...,"v1").isFollowing` true, `fetchUser(...,"v2").isFollowing` false, `followersCount` 48_201 for both; repeating it -> still 48_201; existing search/suggested tests updated with `"v1"` and still pass.
  - `user-store`: **viewer isolation** - `upsertUsers([u], "v1")` with `isFollowing` true, `toggleFollow("v1", u.id)` -> v1 projection false, v2 projection (`useUser` rendered with viewer v2) untouched, shared `followersCount` -1; `setFollowedIds("v1", ids, staleVersion)` -> returns false & ignored, current version -> `loaded` true; `ensureUser` returns cached base without service call, 2 concurrent calls -> 1 call; `ensureFollowGraph("v1")` twice -> 1 `fetchFollowedIds` call, retried once when version moved; `useUser` returns the same reference across unrelated store updates.
  - `follow-button.test.tsx`: click -> `toggleFollow(viewerId, id)` + `setFollow(id, true, viewerId)`.
- [x] **Step 2:** `npm run test -- user-service user-store follow-button` -> FAIL.
- [x] **Step 3:** Implement. `user-service` db keeps base profile + global `followersCount`; `isFollowing` computed per call from `getFollowedAuthorIds(viewerId)`; `setFollow` idempotent. `useUser`: select `[users[id], follows[viewer]?.ids[id] === true]` with `useShallow`, merge in `useMemo`. `useFollowedIds`: `useShallow` over `Object.keys(follows[viewer]?.ids ?? {})` + `loaded`, `useMemo(new Set)`. Callers pass `useViewerId()` (search & sidebar rows use `useUser` unchanged).
- [x] **Step 4:** `npm run test` -> all PASS; `npm run typecheck` exit 0.
- [x] **Step 5:** Commit `feat(profile): viewer-scoped user service & user-store projection`.

---

### Task 4: `post-service` - viewer feed, owner mutations, new-post stream

**Files:**
- Create: `src/features/posts/mocks/mock-incoming.ts` (`MOCK_INCOMING_CONTENTS: string[]`, 12 short Vietnamese posts, >= 4 containing `#tag`)
- Modify: `src/features/posts/services/post-service.ts`, `post-service.test.ts`, `src/features/posts/index.ts` (export `ForbiddenError`)

**Interfaces:**
- Consumes: Task 1 `getFollowedAuthorIds`, `SEED_AUTHORS`; Task 2 `getPostFeedTabs`.
- Produces: `fetchFeed(tab: FeedTab, page: number, viewerId: string): Promise<FeedPage>`; `class ForbiddenError extends Error` (`name = "ForbiddenError"`); `updatePostContent(id: string, content: string, actorId: string): Promise<PostItem>`; `deletePost(id: string, actorId: string): Promise<{ deletedIds: string[] }>`; `setPostPinned(id: string, pinned: boolean, actorId: string): Promise<void>`; `setHideLikeCount(id: string, hidden: boolean, actorId: string): Promise<void>`; `subscribeToNewPosts(listener: (post: PostItem) => void): () => void`; `NEW_POST_INTERVAL_MS = 45_000`, `NEW_POST_JITTER_MS = 10_000`.

- [x] **Step 1: Write failing tests** (fake timers; stream tests use `advanceTimersByTimeAsync`. **Contract = 1-2 posts per tick at 45s ±10s**; `Math.random` spies only pin individual cases)
  - **Feed:** `fetchFeed("following",1,"v1")` only seed-followed authors; after `setFollowed("v1","author-01",true)` includes author-01 posts; `"v2"` unaffected.
  - **Authorization:** for each of edit/delete/pin/hideLikeCount on a post by `author-01` with actor `"author-02"` -> rejects `ForbiddenError`, post unchanged; unknown id -> rejects `Error`.
  - **Edit:** `updatePostContent(id,"  Mới #Moi  ","author-01")` -> content `"Mới #Moi"`, `isEdited` true; "updatePostContent re-indexes tags & trims": `fetchPostsByTag("Moi")` finds it, old tag no longer does.
  - **Delete:** root with 2 replies + 1 nested -> `deletedIds` length 4, `fetchPostThread(root)` -> `null`; delete reply -> parent `commentsCount - 1`.
  - **Pin:** pin A then B (same author) -> A unpinned, B pinned; pin a reply -> rejects `Error`; unpin clears.
  - **Hide like count:** flag persisted in `fetchPostThread`.
  - **Randomness cases:** `mockReturnValue(0.5)` -> next tick exactly at 45_000ms with 2 posts; `0` -> 35_000ms, 1 post; `0.999` -> 54_980ms, 2 posts; unmocked run over 10 ticks -> every tick emits 1 or 2 posts and every gap in [35_000, 55_000].
  - **Reset isolation:** subscribe + 1 tick + create a post, then `__resetMockDb()` -> `vi.getTimerCount()` 0, old listener never called again, db equals seed, next generated id restarts from counter 1.
  - **Timer lifecycle:** 0 subscribers -> `vi.getTimerCount()` 0; 1st subscribe -> 1; 2nd -> still 1; advance 45_000 -> both listeners get the same 2 post ids, posts in `fetchFeed` page 1; unsubscribe one -> next tick still emits; unsubscribe last -> timer count 0; "resubscribe -> exactly one timer"; unsubscribe called twice is a no-op.
- [x] **Step 2:** `npm run test -- post-service` -> FAIL.
- [x] **Step 3:** Implement. Ownership & existence checked after `simulateNetwork()` and BEFORE any write. `__resetMockDb()` resets db, `idCounter`, listeners set and pending timer. Tick delay = `NEW_POST_INTERVAL_MS + Math.round((Math.random() * 2 - 1) * NEW_POST_JITTER_MS)`; count = `Math.random() < 0.5 ? 1 : 2`; author = `SEED_AUTHORS[Math.floor(Math.random() * SEED_AUTHORS.length)]`; content picked the same way; id `post-live-${Date.now()}-${++idCounter}`. Emit `copy(post)` per listener. Existing `fetchFeed` callers updated (PostFeed passes viewer in Task 12; until then pass `useCurrentAuthor().id`).
- [x] **Step 4:** `npm run test -- post-service` -> PASS; `npm run typecheck` exit 0.
- [x] **Step 5:** Commit `feat(posts): owner mutations, viewer feed & simulated new-post stream`.

---

### Task 5: `post-store` - incoming buffer, tombstones, delete reconciliation

**Files:**
- Modify: `src/features/posts/store/post-store.ts`, `post-store.test.ts`

**Interfaces:**
- Consumes: Task 2 types & `getPendingFeed`.
- Produces (state): `incoming`, `consumedIncoming`, `droppedAuthorIds` (shape = `IncomingBuffer`), `deletedIds: Record<string, true>`; `INCOMING_CAP = 20`.
- Produces (actions): `bufferIncoming(post: PostItem): void`, `flushPending(tab: FeedTab, ids: string[]): void`, `consumeIncoming(tab: FeedTab, ids: string[]): void`, `removePost(id: string): RemovalSnapshot | null`, `markDeleted(ids: string[]): void`, `restorePosts(snapshot: RemovalSnapshot): void`.
- Produces (selectors): `useIncomingBuffer(): IncomingBuffer` (`useShallow`), `useIsDeleted(id: string): boolean`.

- [x] **Step 1: Write failing tests**
  - buffer: dedupe vs `incoming`, any `feedIds`, tombstone; id already in `feedIds.forYou` -> consumed for forYou; 21st -> `incoming.length` 20, oldest gone, its author in `droppedAuthorIds` of tabs where it was unconsumed only, pruned from `consumedIncoming`.
  - flush: prepends given ids in order, consumes ONLY those ids for that tab, clears `droppedAuthorIds[tab]`; "flush skips ids already in feed" (no duplicates).
  - `consumeIncoming` consumes & clears dropped; "setFeedPage page 1 consumes incoming ids it contains" (extend `setFeedPage`: `append=false` -> consume `ids ∩ incoming` for that tab AND clear `droppedAuthorIds[tab]`); "page-1 refetch clears overflow": after 21 buffered, `setFeedPage(tab, ids, false)` -> `getPendingFeed(...).overflow` false; `append=true` leaves dropped authors untouched.
  - tombstones: `upsertPosts`, `bufferIncoming`, `setReplies`, `setFeedPage` skip tombstoned ids.
  - `removePost(root)`: subtree (root + cached replies + nested) gone from `posts`, every `feedIds`, `incoming`, `replyIds`; tombstoned; snapshot indexes correct. `removePost(reply)`: parent `commentsCount - 1`, removed from `replyIds[parent]`. Unknown id -> `null`, state unchanged.
  - `markDeleted(["x-uncached","r1"])`: both tombstoned, cached `r1` removed, idempotent (twice = once); later `upsertPosts([x-uncached])` / `bufferIncoming` / `setReplies` ignore it.
  - `restorePosts(snapshot)`: exact inverse (same `feedIds` order, counts, `incoming`, consumed); "restorePosts twice = once" (no duplicate ids, count +1 once); restored ids removed from `deletedIds` (`useIsDeleted` false).
- [x] **Step 2:** `npm run test -- post-store` -> FAIL.
- [x] **Step 3:** Implement; every action ONE `set()`; `removePost` returns snapshot computed from the pre-`set` state (`get()`).
- [x] **Step 4:** `npm run test -- post-store` -> PASS.
- [x] **Step 5:** Commit `feat(posts): incoming buffer, tombstones & delete reconciliation in post-store`.

---

### Task 6: `post-store` - owner-op locks, edit, pin index, hide like count

**Files:**
- Modify: `src/features/posts/store/post-store.ts`, `post-store.test.ts`

**Interfaces:**
- Produces (state): `pinnedIdByAuthor: Record<string, string>`, `ownerOpById: Record<string, OwnerOp>`.
- Produces (actions): `beginOwnerOp(id: string, op: OwnerOp): boolean`, `endOwnerOp(id: string): void`, `editPost(id: string, content: string): void`, `setPinned(id: string, pinned: boolean): string | undefined` (returns previously pinned id it unpinned), `setHideLikeCount(id: string, hidden: boolean): void`, `patchPostIf(id: string, expected: Partial<PostItem>, patch: Partial<PostItem>): void`.
- Produces (selectors): `useOwnerOp(id: string): OwnerOp | undefined`.

- [x] **Step 1: Write failing tests**
  - lock: `beginOwnerOp` true then false for same id; true for another id; `endOwnerOp` frees.
  - edit: content + `isEdited`.
  - pin: pin A -> index A; pin B (same author) -> A `isPinned` false, B true, index B, return `"A"`; unpin B -> index entry removed; `upsertPosts([{...C, isPinned:true}])` reindexes to C and unpins cached B; `upsertPosts` with B `isPinned:false` while index -> B clears index; `removePost(pinned)` clears index (extends Task 5 test); `restorePosts` restores index; `markDeleted([pinnedId])` clears index & no `pinnedIdByAuthor` value points to a tombstoned id; `markDeleted` of a non-pinned id leaves the author's pin intact.
  - `patchPostIf`: applies when expected matches; no-op when any key differs ("edit rollback keeps concurrent hideLikeCount").
  - hide like count toggles flag.
- [x] **Step 2:** `npm run test -- post-store` -> FAIL.
- [x] **Step 3:** Implement helper `reindexPins(posts, index, changed: PostItem[])` used by `upsertPosts`, `prependPost`, `bufferIncoming`, `addReply`, `setPinned`, `removePost`, `restorePosts`, `markDeleted`.
- [x] **Step 4:** `npm run test -- post-store` -> PASS.
- [x] **Step 5:** Commit `feat(posts): owner-op locks, pin index & hide-like state`.

---

### Task 7: i18n keys

**Files:**
- Modify: `src/lib/locales/vi.json`, `src/lib/locales/en.json`, `src/hooks/use-translation.ts`
- **Feature scope:** new `hoverCard.*` domain in `TranslationKey` + keys below.
- **Cleanup (not feature scope, gap #5 / 7.6):** add the existing `saved` domain to `TranslationKey` (keys already in both locale files; union drifted) so touched `post-card.tsx` can drop `t("saved.unsave" as any)`. Other `saved.*` `as any` call sites are NOT touched here.

| Key | vi | en |
|---|---|---|
| `feed.newPosts` | `{n} bài mới` | `{n} new posts` |
| `feed.newPostsOverflow` | `20+ bài mới` | `20+ new posts` |
| `feed.newPostsAria` | `Có bài mới, nhấn để xem` | `New posts available, click to show` |
| `card.edit` | `Chỉnh sửa` | `Edit` |
| `card.editLabel` | `Nội dung bài viết` | `Post content` |
| `card.editSave` | `Lưu` | `Save` |
| `card.editCancel` | `Huỷ` | `Cancel` |
| `card.editSuccess` | `Đã cập nhật bài viết` | `Post updated` |
| `card.edited` | `Đã chỉnh sửa` | `Edited` |
| `card.pin` | `Ghim lên trang cá nhân` | `Pin to profile` |
| `card.unpin` | `Bỏ ghim` | `Unpin` |
| `card.pinned` | `Đã ghim` | `Pinned` |
| `card.pinSuccess` | `Đã ghim bài viết` | `Post pinned` |
| `card.unpinSuccess` | `Đã bỏ ghim bài viết` | `Post unpinned` |
| `card.hideLikes` | `Ẩn số lượt thích` | `Hide like count` |
| `card.showLikes` | `Hiện số lượt thích` | `Show like count` |
| `card.likesHiddenHint` | `Chỉ bạn thấy số lượt thích` | `Only you can see the like count` |
| `card.likesAria` | `{n} lượt thích` | `{n} likes` |
| `card.delete` | `Xoá` | `Delete` |
| `card.deleteTitle` | `Xoá bài viết?` | `Delete post?` |
| `card.deleteDescription` | `Bài viết và các trả lời của nó sẽ bị xoá vĩnh viễn.` | `This post and its replies will be permanently deleted.` |
| `card.deleteSuccess` | `Đã xoá bài viết` | `Post deleted` |
| `card.forbidden` | `Bạn không có quyền thực hiện thao tác này` | `You don't have permission to do that` |
| `card.notInterested` | `Không quan tâm` | `Not interested` |
| `card.notInterestedToast` | `Sẽ hiển thị ít bài như thế này hơn` | `You'll see fewer posts like this` |
| `card.mute` | `Ẩn @{username}` | `Mute @{username}` |
| `card.muteToast` | `Đã ẩn @{username}` | `Muted @{username}` |
| `card.block` | `Chặn @{username}` | `Block @{username}` |
| `card.blockToast` | `Đã chặn @{username}` | `Blocked @{username}` |
| `card.copyLink` | `Sao chép liên kết` | `Copy link` |
| `card.report` | `Báo cáo bài viết` | `Report post` |
| `card.reportToast` | `Đã gửi báo cáo. Cảm ơn bạn!` | `Report submitted. Thank you!` |
| `hoverCard.followers` | `người theo dõi` | `followers` |
| `hoverCard.following` | `đang theo dõi` | `following` |
| `hoverCard.loadError` | `Không tải được hồ sơ` | `Couldn't load profile` |
| `hoverCard.retry` | `Thử lại` | `Retry` |

- [x] **Step 1:** Add keys (both files, same order). Cancel buttons reuse `card.editCancel`.
- [x] **Step 2:** `npm run typecheck` -> exit 0; `npm run test` -> PASS.
- [x] **Step 3:** Commit `feat(i18n): feed pill, owner actions & hover card keys`.

---

### Task 8: `useOwnerActions` runner (incl. 2 delete modes)

**Files:**
- Create: `src/features/posts/hooks/use-owner-actions.ts`, `use-owner-actions.test.tsx`

**Interfaces:**
- Consumes: Task 4 service fns + `ForbiddenError`; Task 5/6 store actions; `useCurrentAuthor`; `usePathname`, `useRouter`; `toast` (sonner).
- Produces: `isInViewedSubtree(pathname: string, postId: string, posts: Record<string, PostItem>): boolean` (exported pure); `useOwnerActions(postId: string): { pendingOp: OwnerOp | undefined; edit(content: string): Promise<boolean>; togglePin(): Promise<void>; toggleHideLikeCount(): Promise<void>; remove(): Promise<boolean> }`.

- [x] **Step 1: Write failing tests** (mock `next/navigation`, mock service module with controllable promises)
  - `isInViewedSubtree`: `/posts/A` & id A -> true; `/posts/R` where `R.parentId = A` -> true for A; `/` -> false; unrelated -> false.
  - edit success -> content updated, lock released; edit reject while `hideLikeCount` toggled concurrently in store -> content reverted, `hideLikeCount` kept; Forbidden -> `toast.error("card.forbidden" text)`; other error -> `common.error`.
  - 2nd op while pending -> service not called, returns early.
  - pin reject -> target & previously pinned post restored only if still in optimistic state.
  - delete (list mode): optimistic removal before resolve; success -> `markDeleted(deletedIds)`, no navigation; reject -> `restorePosts`, toast.
  - **viewed-route delete:** pathname `/posts/A`, `remove()` on A -> A removed optimistically immediately; `router.replace` NOT called while pending; success -> `markDeleted` + `router.replace("/")` once; failure -> A restored (`usePost("A")` defined, not tombstoned), no navigation, toast. Same for pathname `/posts/R` with `R.parentId = A`.
  - "double delete confirm calls service once".
- [x] **Step 2:** `npm run test -- use-owner-actions` -> FAIL.
- [x] **Step 3:** Implement per §4.7 table (snapshot only touched fields; `finally endOwnerOp`). Delete: compute `isInViewedSubtree` BEFORE `removePost` (cache still has the `parentId` chain).
- [x] **Step 4:** Same command -> PASS.
- [x] **Step 5:** Commit `feat(posts): owner action runner with field-scoped rollback`.

---

### Task 9: Split `PostCard` (no behavior change)

**Files:**
- Create: `src/features/posts/components/post-media-grid.tsx`, `post-lightbox.tsx`, `src/features/posts/components/post-card.test.tsx`
- Modify: `src/features/posts/components/post-card.tsx`

**Interfaces:**
- Produces: `<PostMediaGrid images: string[] onOpen(index: number) />`, `<PostLightbox images: string[] index: number | null onIndexChange(i: number) onClose() />`.

- [x] **Step 1: Write characterization tests** `post-card.test.tsx` (render with seeded store): like toggles `aria-pressed` + count; bookmark toggles; clicking image opens dialog with `1 / 3` counter, next arrow -> `2 / 3`; Comment button pushes `/posts/<id>`.
- [x] **Step 2:** `npm run test -- post-card` -> PASS on current code (baseline).
- [x] **Step 3:** Move media grid & lightbox (incl. fullscreen listener) into the new files; `PostCard` keeps layout + toolbar.
- [x] **Step 4:** `npm run test -- post-card` -> PASS; `npx eslint src/features/posts/components` -> no new issues.
- [x] **Step 5:** Commit `refactor(posts): split PostCard media grid & lightbox`.

---

### Task 10: Owner menu, inline editor & card labels

**Files:**
- Create: `src/features/posts/components/post-card-menu.tsx`, `post-card-menu.test.tsx`, `post-inline-editor.tsx`, `post-inline-editor.test.tsx`
- Modify: `src/features/posts/components/post-card.tsx`, `post-card.test.tsx`, `src/features/posts/components/detail/post-detail-main.tsx` (stats row via `getVisibleLikeCount`, if it renders likes)

**Interfaces:**
- Consumes: Task 8 `useOwnerActions`; Task 2 `getVisibleLikeCount`; Task 5 `useIsDeleted`; Task 6 `useOwnerOp`; `AlertDialog` (`@/components/ui/alert-dialog`), `Tooltip`.
- Produces: `<PostCardMenu post: PostItem isOwner: boolean isSavedPage?: boolean onUnsave?(id: string) onEdit() />`, `<PostInlineEditor initialContent: string hasImages: boolean disabled: boolean onSave(content: string): Promise<boolean> onCancel() />`; `POST_CONTENT_MAX = 500` exported from `post-inline-editor.tsx` (same value as `postSchema`).

- [x] **Step 1: Write failing tests**
  - menu: owner sees Edit / Pin / Hide likes / Delete, no Mute/Block; non-owner sees Not interested / Mute / Block / Copy link / Report, no owner items; reply (`parentId` set) -> no Pin; `ownerOpById` set -> owner items `aria-disabled`; Delete -> dialog -> confirm calls `remove` once; Cancel closes without call.
  - editor: autofocus with caret at end; Save disabled when unchanged, when `"   "` & `hasImages=false`, when `disabled`; counter `n/500`, Save disabled at 501 chars; Esc -> `onCancel`; Ctrl+Enter -> `onSave(trimmed)`.
  - card: tombstoned id -> renders nothing; `hideLikeCount` + other viewer -> no count, owner -> count + hint icon; `isEdited` -> "Đã chỉnh sửa"; `isPinned` root -> "Đã ghim" badge, compact variant -> no badge.
- [x] **Step 2:** `npm run test -- post-card-menu post-inline-editor post-card` -> FAIL.
- [x] **Step 3:** Implement. Owner = `post.user.id === useCurrentAuthor().id`. Menu hidden on `isPending`. Delete dialog closes on confirm in every mode (D14 always optimistic); lock blocks a 2nd delete. Remove `t("..." as any)` & hard-coded menu strings.
- [x] **Step 4:** Same command -> PASS; `npm run typecheck` exit 0.
- [x] **Step 5:** Commit `feat(posts): owner menu, inline editor, pinned/edited labels & hidden likes`.

---

### Task 11: Hover card & store-bound header Follow

**Files:**
- Create: `src/components/ui/hover-card.tsx`, `src/features/profile/components/user-hover-card.tsx`, `user-hover-card.test.tsx`
- Modify: `src/features/profile/index.ts`, `src/features/posts/components/post-card.tsx` (+ test), `src/features/profile/components/profile-container.tsx` (drop `isAuthorFollowing` / `onAuthorFollowToggle`)

**Interfaces:**
- Consumes: Task 3 `ensureUser`, `useUser`, `FollowButton`, `parseBio`; Task 1 `useViewerId`.
- Produces: shadcn `HoverCard`, `HoverCardTrigger`, `HoverCardContent` (from `radix-ui`); `<UserHoverCard userId: string username: string children />` (exported via `@/features/profile`).

- [x] **Step 1: Write failing tests** (open via `HoverCard` `open` prop or `pointerEnter` + fake timers 500ms)
  - uncached -> skeleton then name, bio, compact counts (expected string built with the same `Intl.NumberFormat("vi-VN", { notation: "compact" })` call, NOT hard-coded), Follow; cached -> no service call; `fetchUser` null -> `hoverCard.loadError` + Retry, Retry refetches; self (`viewerId === userId`) -> no Follow.
  - "follow in card -> PostCard header button + card count update": render `PostCard` (author-01) + open card; click Follow in card -> header button `aria-pressed` true, card follower count +1.
  - `PostCard` own post -> no header Follow button.
  - **touch:** `fireEvent.pointerEnter(trigger, { pointerType: "touch" })` + advance 600ms -> no card content rendered; trigger is an `<a href="/@antigravity.core">` (tap navigates).
- [x] **Step 2:** `npm run test -- user-hover-card post-card` -> FAIL.
- [x] **Step 3:** Implement. Card reads `useUser(userId)`; local state = `"idle" | "loading" | "error"` only; `openDelay={500}` `closeDelay={150}`, content `w-72`; counts via `Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", { notation: "compact" })`. `PostCard` wraps avatar link & name link; header uses `<FollowButton userId={post.user.id} />`; remove follow `useState`/`useEffect` & the two props.
- [x] **Step 4:** `npm run test` -> all PASS; `npm run typecheck` exit 0.
- [x] **Step 5:** Commit `feat(profile): author hover card & store-bound PostCard follow`.

---

### Task 12: New-posts stream hook, pill & `PostFeed` wiring

**Files:**
- Create: `src/features/posts/hooks/use-new-posts-stream.ts`, `use-new-posts-stream.test.tsx`, `src/features/posts/components/new-posts-pill.tsx`, `new-posts-pill.test.tsx`, `src/features/posts/utils/scroll.ts`
- Modify: `src/features/posts/components/post-feed.tsx`

**Interfaces:**
- Consumes: Task 4 `subscribeToNewPosts`, `fetchFeed`; Task 2 `getPendingFeed`; Task 3 `ensureUser`, `ensureFollowGraph`, `useFollowedIds`, `getFollowedIds`; Task 5 `bufferIncoming`, `flushPending`, `consumeIncoming`, `useIncomingBuffer`.
- Produces: `scrollFeedToTop(): void` (D15 single scroll owner: `window.scrollTo({ top: 0, behavior })`, `behavior = "auto"` when `matchMedia("(prefers-reduced-motion: reduce)").matches` else `"smooth"`); `useNewPostsStream(): void`; `usePendingFeed(tab: FeedTab): PendingFeed & { authors: PostAuthor[] }` (in `post-store.ts` or the pill file; authors = first 3 of `ids`); `<NewPostsPill tab: FeedTab onRefetch(): Promise<void> />`.

- [x] **Step 1: Write failing tests**
  - stream hook: subscribes on mount, unsubscribes on unmount; `visibilitychange` to hidden -> unsubscribed, visible -> resubscribed; received post -> `bufferIncoming` + `ensureUser(authorId, viewerId)`; "StrictMode mount subscribes once net" (render in `<StrictMode>` -> 1 active listener).
  - pill: hidden when tab not loaded / 0 pending & no overflow; shows `3 bài mới` + max 3 avatars; overflow -> `20+ bài mới`, click calls `onRefetch` (not flush); click -> `flushPending(tab, ids)` + `scrollFeedToTop()` called once; `scrollFeedToTop` unit: smooth vs auto by reduced-motion; following tab uses the COMPLETE viewer follow set (author never cached in `user-store` but in `fetchFollowedIds` -> counted); follow graph not loaded -> following count 0; follow later -> count increases.
- [x] **Step 2:** `npm run test -- use-new-posts-stream new-posts-pill` -> FAIL.
- [x] **Step 3:** Implement. Pill wrapper `sticky top-14 z-10 h-0` + inner `absolute inset-x-0 flex justify-center pt-2`; button `min-h-11 rounded-full border bg-white/80 dark:bg-zinc-900/80 backdrop-blur shadow-lg` + `animate-in fade-in slide-in-from-top-2 motion-reduce:animate-none`; `aria-live="polite"` region; `ArrowUp` icon. `PostFeed`: `void ensureFollowGraph(viewerId)` on mount; `fetchFeed(tab, page, viewerId)`; after page-1 success -> `consumeIncoming(tab, getPendingFeed(state.posts, buffer, tab, getFollowedIds(viewerId).ids).ids)` (skip when follow graph not loaded for `following`); `onRefetch = () => loadWithFeedback(activeTab, 1)`; render `<NewPostsPill>` right after header; call `useNewPostsStream()`.
- [x] **Step 4:** `npm run test` -> all PASS; `npm run typecheck` exit 0.
- [x] **Step 5:** Commit `feat(posts): new-posts stream & X-style pill in feed`.

---

### Task 13: Verification, cleanup & docs

**Files:**
- Modify: touched files (sort/remove imports), `.context/features/feed-post-interaction.md` (create), `.context/INDEX.md`, `.context/features/frontend-roadmap.md`, `.context/conventions/frontend.md` (only if a new rule emerged), this plan (check boxes), spec (if reality diverged)

- [x] **Step 1:** `npm run test` -> all PASS (report counts); `npm run typecheck` exit 0; `npx eslint src` -> <= 62 errors / <= 25 warnings (baseline minus the 2 `post-card.tsx` errors), no new issue in touched files.
- [x] **Step 2:** Browser pane (`preview_start` dev server, temporarily set `NEW_POST_INTERVAL_MS = 5_000` locally, revert before commit):
  - pill appears with avatars, click -> posts on top + scroll top; switch tab -> separate counts; follow a pending post's author -> following count updates
  - compose a post -> edit (Esc / Ctrl+Enter), "Đã chỉnh sửa"; pin -> "Đã ghim", pin another -> first loses badge; hide likes -> owner sees hint
  - delete from feed (vanishes, search result too); open own post detail -> delete -> post vanishes at once, lands on `/` only after success
  - hover author name -> card, Follow in card -> header button & sidebar suggestion update; mobile preset (touch) -> tap name opens profile, no card
  - log out / log in as another viewer -> follow states differ per viewer
  - 375 / 768 / 1440, light & dark, keyboard: menu, dialog focus trap, editor shortcuts, pill focusable
- [x] **Step 3:** Docs (Task Closure Protocol, `01-doc-standards.md` format): new `.context/features/feed-post-interaction.md` (as-built; spec decisions D1-D16 + D5b as actually implemented, plus any NEW implementation decisions numbered separately as I1, I2...; pitfalls found); INDEX entry; roadmap: 1.4/1.5/1.6 `[x]`, gap #2 `[x]`, F0.2 note (seed authors + follow graph), gap #5 / 7.6 note (`post-card.tsx` `as any` removed).
- [x] **Step 4:** Commit `docs(feed): as-built context, roadmap & plan status`.

---

## Follow-ups (final review minors)

> Source: as-built "Deferred follow-ups". Baseline: 326 passed / 38 files, typecheck 0, eslint 62 / 25.

### Task 14: Owner mutation reconciliation

**Files:** `services/post-service.ts`, `hooks/use-owner-actions.ts`, `store/post-store.ts`, `utils/post-content.ts` (new), `components/post-inline-editor.tsx` + tests

- [x] **Step 1:** `setPostPinned` / `setHideLikeCount` return the post copy (like `updatePostContent`). Hook applies the service copy on success, field-scoped (edit: `content`, `isEdited`; pin: `setPinned(id, server.isPinned)`; hide: `hideLikeCount`) -> a stale page-1 refetch landing mid-op cannot win. Test: upsert stale copy while op pending -> resolved state = service copy
- [x] **Step 2:** Delete navigation: `router.replace("/")` only when `window.location.pathname` still equals the pathname captured at start. Test: route changed before resolve -> no navigation
- [x] **Step 3:** `restorePosts` restores a previously pinned root as unpinned when the author has another pin in the index. Test in `post-store.test.ts`
- [x] **Step 4:** `POST_CONTENT_MAX` -> `utils/post-content.ts`; mock `updatePostContent` rejects trimmed content > max or empty without images. Tests in `post-service.test.ts`

### Task 15: Viewer-scoped follow knowledge (account switch)

**Files:** `profile/types`, `profile/store/user-store.ts`, `profile/components/{follow-button,user-hover-card}.tsx`, `posts/components/post-feed.tsx` + tests

- [x] **Step 1:** `ViewerFollows.known` (ids whose follow state was fetched/toggled for that viewer). `ensureUser` treats a user as cached ONLY when the viewer's graph is loaded or the id is known; `useFollowState(id)` -> `boolean | undefined`. Test: user cached by viewer A -> `ensureUser(id, B)` fetches
- [x] **Step 2:** `FollowButton` renders nothing (or reserved placeholder) while follow state unknown -> never shows a guessed "Follow". Hover card loads when user or follow state is missing
- [x] **Step 3:** `PostFeed` page-1 load retries `ensureFollowGraph` when not loaded (refresh / tab first load / pill overflow). Test: 1st graph load fails, refresh -> graph loaded

### Task 16: Card & pill polish

**Files:** `posts/components/{post-card,post-card-menu,new-posts-pill}.tsx`, `profile/components/{follow-button,user-hover-card}.tsx`, `services/post-service.ts` + tests

- [x] **Step 1:** `FollowButton reserveSpace`: invisible, `aria-hidden` same-size placeholder while user/follow state unknown (header CLS at 375px); used by `PostCard` header
- [x] **Step 2:** Hover card `Intl.NumberFormat` cached per locale (module-level, like `user-result-row.tsx`)
- [x] **Step 3:** `useOwnerActions` runs ONLY for owner cards, once: `PostCard` -> `OwnerPostCard` (calls hook) -> body; `PostCardMenu` takes `owner?: OwnerActions` instead of `isOwner`. Test: viewer card never reads `usePathname`
- [x] **Step 4:** Pill: in-flight guard on overflow refetch (button `disabled`, `aria-busy`). Test: 2 clicks -> 1 refetch
- [x] **Step 5:** ⋯ trigger: invisible `after:` hit area -> 44px, visual size unchanged
- [x] **Step 6:** Stream: tick reschedules ONLY while a listener remains (listener unsubscribing inside callback leaves 0 timers). Test with fake timers

### Task 17: Verification & docs

- [x] **Step 1:** `npm run test`, `npm run typecheck`, `npx eslint src` (<= 62 / 25, none new)
- [x] **Step 2:** Browser pane: feed renders, owner menu / edit / pin, hover card, 375px header no shift
- [x] **Step 3:** As-built: move items from "Deferred follow-ups" into decisions (I8+), update Files/Testing; spec note; roadmap `updated`
