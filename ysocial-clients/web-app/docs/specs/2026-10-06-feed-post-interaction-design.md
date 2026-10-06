# Feed & Post Interaction - Design Spec

- **Date:** 2026-10-06
- **Status:** implemented 2026-10-06 (as-built notes: `.context/features/feed-post-interaction.md`, implementation decisions I1-I5)
- **Roadmap:** `.context/features/frontend-roadmap.md` -> Phase 1.4 ("Có bài mới" pill) + 1.5 (Post owner actions) + 1.6 (User hover card), merged; also closes gap #2 (`PostCard` follow local state) & part of F0.2 (shared seed authors, follow graph)
- **Scope rule:** FE ONLY. NO BE/API/DB calls in any new/touched flow; all data from in-repo mocks.

## 1. Goal

- Simulated push of new posts -> buffered, X-style "N bài mới" pill; click merges on top + scrolls to top, list never shifts on its own
- Owner can Edit (inline, text only), Delete (confirm), Pin (1 per author), Hide like count on own posts
- Hover on author avatar/name in `PostCard` -> profile card with live follow state
- Follow state single-sourced: `PostCard` header, hover card, sidebar, search all read `user-store`

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Scope | 1.4 + 1.5 + 1.6 in one spec ("Feed & Post Interaction") |
| D2 | Pill UX | Buffer + pill (X-style): 3 stacked avatars + count; click -> flush + scroll top; NO auto-insert |
| D3 | Push simulation | Approach A: `post-service.subscribeToNewPosts` event stream (SignalR-shaped) + buffer in `post-store`. Rejected: polling `fetchFeedSince` (rewrite on SignalR), `setInterval` in component (mock leaks into UI) |
| D4 | Push cadence | `setTimeout` chain, 45s ±10s random per tick, 1-2 posts emitted once (tab classification at read time), paused while `document.hidden` or feed unmounted |
| D5 | Buffer cap | 20 incoming entries; overflow -> pill "20+", click = refetch page 1 |
| D5b | Pending tracking | Per-tab consumed ids (NOT a seq cursor) -> a post skipped by a tab stays eligible; classification always uses the current follow state |
| D6 | Pin scope | Store + service `isPinned` + "Đã ghim" badge; profile ordering deferred to F0.6 / 2.1. Root posts ONLY |
| D7 | Delete | Confirm `AlertDialog` only (Threads-style), no undo |
| D8 | Edit | Inline autosize textarea, text only (images unchanged), no time limit |
| D9 | Ownership | Enforced by service (`actorId` arg, `ForbiddenError`); UI visibility is only presentation |
| D10 | Concurrency | Max 1 pending owner mutation per post (`ownerOpById`) + field-scoped conditional rollback |
| D11 | Follow source | `src/mocks/follow-graph.ts` = viewer-scoped mock backend table; feed tab classification via pure `getPostFeedTabs`; client classifies pending posts at read time from `user-store` |
| D14 | Delete semantics | Delete is ALWAYS optimistic (list & detail). On the viewed route, `router.replace("/")` runs ONLY after the mock service resolves; failure -> `restorePosts` + toast, no navigation |
| D15 | Scroll owner | Feed scroll owner = **document** (verified 2026-10-06: `MainLayout` `main` has no `overflow`, only `min-h-screen`; header `sticky top-0`). All feed scrolling goes through ONE helper `scrollFeedToTop()` (`posts/utils/scroll.ts`) -> `window.scrollTo`; a future scroll container changes only that helper |
| D16 | Viewer-scoped user cache | `user-store` keeps shared profile data (`users`) + per-viewer follow projection (`follows[viewerId]`); complete follow set loaded via `fetchFollowedIds(viewerId)`; `useUser(id)` projects `isFollowing` for the current viewer |
| D12 | Seed "me" post | NO seed (current user id varies: login "1", register "2", guest "me"); demo via composer |
| D13 | Hover card data | Subscribes `useUser(id)`; `ensureUser(id, viewerId)` fetches only when not cached; touch devices -> link navigates, no card |

## 3. Global Constraints

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zustand 5, shadcn/Radix (`radix-ui` umbrella pkg), Lucide. **NO new deps.**
- Files/dirs `kebab-case`; components `PascalCase`; vars/functions `camelCase`; CRLF line endings.
- Domain types in `features/<feature>/types/index.ts`; cross-feature imports ONLY via `@/features/<feature>` or `@/features/<feature>/types`.
- All strings via `useTranslation()`, keys in `vi.json` & `en.json`, NO `as any` (new code + touched `post-card.tsx`).
- Touch targets >= 44px; icon-only buttons have `aria-label`; transitions 150-300ms, `motion-reduce` respected.
- Store updates touching >1 entity (pin, remove, flush) happen in ONE `set()` -> no visible intermediate state.

## 4. Architecture & Data Flow

```
post-service.subscribeToNewPosts ──(PostItem)──> useNewPostsStream (PostFeed)
                                                   ├─> bufferIncoming(post)      [post-store]
                                                   └─> ensureUser(post.user.id)   [user-store]
NewPostsPill <── usePendingFeed(tab) = getPendingFeed(post-store, tab, followed from user-store)
                   = incoming - consumed[tab], filtered by getPostFeedTabs(post, followed)
     click ──> flushPending(tab, ids)  |  overflow -> loadPage(tab, 1) -> consumeIncoming(tab, pending ids)

PostCardMenu (owner) ──> runOwnerOp(postId, op): lock -> optimistic store update -> service(actorId) -> commit | field rollback -> unlock
                         (delete of viewed route: lock -> service -> navigate -> remove; no optimistic step)
UserHoverCard ──> useUser(id) + ensureUser(id) ──> FollowButton (user-store) <── PostCard header
```

- Swap point for real API/SignalR: service bodies + `useNewPostsStream` subscription ONLY; UI & stores unchanged.

### 4.1 Shared mocks (`src/mocks/`) - breaks import cycle

- **Problem:** `profile/mocks/mock-users.ts` imports `MOCK_AUTHORS` from barrel `@/features/posts`. `PostCard` will import `@/features/profile` (hover card, `FollowButton`) -> cycle `posts -> profile -> mock-users -> posts` -> TDZ error on top-level `MOCK_AUTHORS.map`.
- **Fix:**
  - `src/mocks/seed-authors.ts`: `SEED_AUTHORS` (moved from `posts/mocks/mock-authors.ts`, `import type { PostAuthor }` only) + `SEED_FOLLOWED_AUTHOR_IDS`
  - `src/mocks/follow-graph.ts`: viewer-scoped mock backend follow table (`Map<viewerId, Set<authorId>>`)
    ```ts
    export function getFollowedAuthorIds(viewerId: string): ReadonlySet<string>; // unknown viewer -> lazily seeded copy of SEED_FOLLOWED_AUTHOR_IDS
    export function setFollowed(viewerId: string, authorId: string, following: boolean): void;
    export function __resetFollowGraph(): void; // test-only, drop all viewers
    ```
    - Every current viewer id (login "1", register "2", guest "me", future profile switch) gets its own follow set; self-follow ignored.
  - `posts/mocks/mock-posts.ts`, `profile/mocks/mock-users.ts` read `@/mocks/seed-authors`; `posts` barrel stops exporting `MOCK_AUTHORS` / `MOCK_FOLLOWED_AUTHOR_IDS`
  - `user-service.setFollow` writes `follow-graph`; `post-service` reads it. NO follow copy in `post-service` or in `user-service` db (`isFollowing` derived per viewer at read time; `followersCount` global, ±1 on change).
- **Remaining barrel cycle** `profile-container -> @/features/posts` vs `PostCard -> @/features/profile` is safe ONLY because cross-feature values are referenced at render/call time. Rule: NO top-level (module-evaluation) use of another feature's exported values.

### 4.2 Types (`posts/types`)

```ts
export interface PostItem {
  // ...existing
  isPinned?: boolean;
  hideLikeCount?: boolean;
}

export type OwnerOp = "edit" | "delete" | "pin" | "hideLikeCount";

export interface PendingFeed { ids: string[]; overflow: boolean; }
```

- `ForbiddenError` class in `posts/services/post-service.ts` (exported via barrel), `name = "ForbiddenError"`.

### 4.3 Pure utils (`posts/utils/`)

- `feed-tabs.ts`: `getPostFeedTabs(post, followedAuthorIds: ReadonlySet<string>): FeedTab[]` -> replies `[]`; root `["forYou"]` + `"following"` when author followed. Used by `fetchFeed` AND pending selector.
- `like-visibility.ts`: `getVisibleLikeCount(post, viewerId): number | null` -> `null` when `hideLikeCount && post.user.id !== viewerId`. EVERY render of a like count goes through it (`PostCard` all variants, detail stats row, `aria-label`). Ranking by likes (search Top, tag Top) still uses raw `likesCount` inside the mock service; the number is never rendered.
- `pending-feed.ts`: `getPendingFeed(posts, buffer: IncomingBuffer, tab, followedAuthorIds): PendingFeed` (pure, O(20))
  - `ids` = `incoming` (newest first) where `!consumedIncoming[tab][id]` & `getPostFeedTabs(posts[id], followed)` includes `tab`
  - `overflow` = `droppedAuthorIds[tab]` has any author classified into `tab` (forYou: non-empty; following: any followed)
  - Used by `usePendingFeed` (hook) AND by `PostFeed` after a page-1 load (via `getState()`), so both read the same rule.

### 4.4 `post-service` (mock)

| Function | Behavior |
|---|---|
| `fetchFeed(tab, page, viewerId)` | Filter roots with `getPostFeedTabs(post, getFollowedAuthorIds(viewerId))` (fixes static `MOCK_FOLLOWED_AUTHOR_IDS` bug); `PostFeed` passes `useCurrentAuthor().id` |
| `subscribeToNewPosts(listener: (post: PostItem) => void): () => void` | Ref-counted shared timer. 1st subscriber -> schedule; each tick: generate 1-2 root posts from `MOCK_INCOMING_CONTENTS` (new mock) by random `SEED_AUTHORS`, write to `db`, emit copies to every listener, schedule next `setTimeout(NEW_POST_INTERVAL_MS ± NEW_POST_JITTER_MS)`. Last unsubscribe -> `clearTimeout`. Unsubscribe idempotent |
| `updatePostContent(id, content, actorId)` | Owner only; sets `content`, `isEdited = true`; returns copy |
| `deletePost(id, actorId)` | Owner only; removes post + all descendants; reply -> parent `commentsCount - 1`; returns `{ deletedIds: string[] }` |
| `setPostPinned(id, pinned, actorId)` | Owner only; root only (reply -> reject `Error`); pin -> unpin author's previous pinned post |
| `setHideLikeCount(id, hidden, actorId)` | Owner only |

- Unknown id -> reject `Error("not found")`; `post.user.id !== actorId` -> reject `ForbiddenError`. Check happens BEFORE any write.
- Constants: `NEW_POST_INTERVAL_MS = 45_000`, `NEW_POST_JITTER_MS = 10_000` (exported for tests / dev tuning).
- Test-only `__resetMockDb()` also stops the stream timer & clears listeners.

### 4.5 `user-service` (mock) & viewer-scoped `user-store`

- All reads/writes take `viewerId`: `searchUsers(query, viewerId, limit?)`, `fetchSuggestedUsers(limit, viewerId)`, `fetchUser(id, viewerId): Promise<UserProfile | null>` (new), `fetchFollowedIds(viewerId): Promise<string[]>` (new, complete set from `follow-graph`), `setFollow(id, following, viewerId)`. Returned `isFollowing` = `getFollowedAuthorIds(viewerId).has(id)` at read time; `followersCount` global.
- Callers updated: `search-service`, `FollowSuggestions`, `ExploreLanding`, `FollowButton`, hover card (all via `useViewerId()`).
- **`user-store` (D16):**
  ```ts
  users: Record<string, UserProfileBase>;          // shared profile data, NO isFollowing
  follows: Record<string, ViewerFollows>;          // viewerId -> projection
  interface ViewerFollows { ids: Record<string, true>; loaded: boolean; version: number }
  ```
  - `UserProfileBase = Omit<UserProfile, "isFollowing">` (in `profile/types`).
  - `upsertUsers(users: UserProfile[], viewerId)`: base -> `users`, `isFollowing` -> `follows[viewerId].ids` (partial knowledge; does not set `loaded`).
  - `toggleFollow(viewerId, id)`: flips `follows[viewerId].ids[id]`, `followersCount ±1` on shared base, `version + 1` (ONE `set()`).
  - `setFollowedIds(viewerId, ids, sinceVersion)`: replaces the set & `loaded = true` ONLY if `version === sinceVersion` (a local toggle during the request wins; caller retries once).
  - `useUser(id): UserProfile | undefined` reads `useViewerId()` internally and projects `isFollowing` (memoized merge of base + flag -> stable reference); `ensureUser(id, viewerId)` (module fn): no-op when base cached; dedupes in-flight per id; upserts.
  - `ensureFollowGraph(viewerId)` (module fn): loads `fetchFollowedIds` once per viewer (dedupe in-flight), called by `PostFeed` mount.
  - `useFollowedIds(): { ids: ReadonlySet<string>; loaded: boolean }` for current viewer; `getFollowedIds(viewerId)` non-hook twin. Pending "Đang theo dõi" classification uses this COMPLETE set; while `loaded === false` the following pending list is empty (never guessed from partial cache).
- **Known limitation:** `post-store` per-viewer flags (`isLikedByCurrentUser`, `isBookmarkedByCurrentUser`) are not viewer-scoped yet; cache reset on viewer change belongs to 2.7.

### 4.6 `post-store`

New data:

```ts
incoming: string[];                                          // post ids, newest first, max INCOMING_CAP = 20
consumedIncoming: Record<FeedTab, Record<string, true>>;     // ids already merged into / covered by that tab; pruned when id leaves `incoming`
droppedAuthorIds: Record<FeedTab, string[]>;                 // authors of entries dropped by cap while unconsumed for that tab (dedup)
pinnedIdByAuthor: Record<string, string>;       // authorId -> pinned root post id (cached posts only)
ownerOpById: Record<string, OwnerOp>;           // 1 pending owner mutation per post
deletedIds: Record<string, true>;               // tombstones
```

- `feedMeta[tab].loaded` (existing) is the per-tab loaded flag.

New actions (each ONE `set()`):

| Action | Behavior |
|---|---|
| `bufferIncoming(post)` | Skip if id already in `incoming`, in BOTH `feedIds` (as-built I3; in one feed -> buffered & consumed for that feed), or tombstoned. Upsert post, prepend id; any tab already holding it in `feedIds` marks it consumed. If length > 20: drop oldest id X; for each tab with `!consumed[tab][X]` -> add `posts[X].user.id` to `droppedAuthorIds[tab]`; prune X from every `consumed[tab]`. Buffered regardless of `loaded`; pill hidden until tab loaded |
| `flushPending(tab, ids)` | `feedIds[tab] = [...ids, ...feedIds[tab] minus ids]`; mark `ids` consumed for `tab` ONLY; `droppedAuthorIds[tab] = []`. Other incoming ids stay unconsumed -> a skipped post becomes pending later if its author gets followed. `ids` = `getPendingFeed` result (classification stays out of the store) |
| `consumeIncoming(tab, ids)` | Mark `ids` consumed for `tab`, `droppedAuthorIds[tab] = []`. Called by `PostFeed` after a successful page-1 load/refetch with `getPendingFeed(getState(), tab, followed).ids` -> those posts are covered by the fetched feed (same follow graph), so no pending duplicates; unclassified ids stay eligible |
| `setFeedPage(tab, ids, append=false, ...)` (existing, extended) | Also marks `ids ∩ incoming` consumed for `tab` (exact server truth) and clears `droppedAuthorIds[tab]` -> successful page-1 load/refetch hides the `20+` state |
| `beginOwnerOp(id, op)` / `endOwnerOp(id)` | Set / clear lock; `beginOwnerOp` returns `false` when a lock exists |
| `editPost(id, content)` | `content`, `isEdited = true` |
| `removePost(id)` | Collect subtree via `replyIds` (cached); delete from `posts`, all `feedIds`, `incoming` (+ `consumed`), `replyIds[parent]` (+ parent `commentsCount - 1` if reply), `replyIds[x]` of removed; clear `pinnedIdByAuthor` entry if pinned; add tombstones. Returns snapshot (removed posts, their list positions, whether parent count was decremented) |
| `markDeleted(ids)` | Reconcile with service `deletedIds` (may include uncached descendants): tombstone ALL ids; remove any cached remnant from `posts` / lists / `incoming` / pin index. Idempotent |
| `restorePosts(snapshot)` | Rollback of `removePost`. Idempotent & deduplicating: re-insert a post / list id ONLY when absent; re-increment parent count ONLY when the snapshot decremented it AND the reply id was actually re-added; restore pin index; drop tombstones of snapshot ids. Calling twice = calling once |
| `setPinned(id, pinned)` | Pin: unpin `pinnedIdByAuthor[author]` (if other & cached) + pin target + index. Unpin: clear flag + index entry |
| `setHideLikeCount(id, hidden)` | Toggle flag |
| `patchPostIf(id, expected, patch)` | Field-scoped rollback: apply `patch` only when every key of `expected` still equals current value |

- **Pin index invariant (cached posts):** `pinnedIdByAuthor[a] === id` <=> `posts[id].isPinned === true && posts[id].user.id === a`. Maintained by helper `reindexPins(state, incomingPosts)` inside `upsertPosts`, `prependPost`, `bufferIncoming`, `addReply` (reply never pinned) and by `setPinned`, `removePost`, `markDeleted`, `restorePosts`. Init `{}`.
- **Tombstone invariant:** `deletedIds[id]` => `id` absent from `posts`, every `feedIds`, `incoming`, `replyIds` lists and `pinnedIdByAuthor` values; `restorePosts` removes restored ids from `deletedIds`.
- Tombstones: `PostCard` returns `null` when `deletedIds[id]` -> deleted post disappears from lists holding their own props (search, saved, tag). `upsertPosts`, `bufferIncoming`, `setReplies`, `setFeedPage` skip tombstoned ids -> a deleted descendant can never reappear.
- Selectors: `usePendingFeed(tab): PendingFeed & { authors: PostAuthor[] }` (`getPendingFeed` over `post-store` + followed ids from `user-store`; `useShallow` per store + `useMemo`; O(20)), `useOwnerOp(id)`, `useIsDeleted(id)`.

### 4.7 Owner mutation runner (`posts/hooks/use-owner-actions.ts`)

```
run(op, id):
  IF !beginOwnerOp(id, op) -> return            // UI also disables, this is the guard
  snapshot only fields op touches
  optimistic store update
  try   await service(..., actorId = currentAuthor.id)
  catch rollback (patchPostIf / restorePosts) + toast (ForbiddenError -> card.forbidden, else common.error)
  finally endOwnerOp(id)
```

| Op | Touched fields | Rollback |
|---|---|---|
| edit | `content`, `isEdited` | `patchPostIf(id, { content: next }, { content: prev, isEdited: prevEdited })` |
| pin | `isPinned` (+ previous pinned post) | `setPinned` inverse only if `isPinned` still `next`; previous pinned post restored only if still unpinned |
| hideLikeCount | `hideLikeCount` | `patchPostIf(id, { hideLikeCount: next }, { hideLikeCount: prev })` |
| delete | whole subtree | `restorePosts(snapshot)` (card gone -> no concurrent op on it); success -> `markDeleted(deletedIds)` |

Delete is always optimistic; only navigation depends on the route (`isViewedSubtree` = current route `/posts/[x]` where `x === id` or `x` descends from `id`, walking cached `parentId`):

```
lock -> removePost (snapshot) -> deletePost
  success: markDeleted(deletedIds); IF isViewedSubtree -> router.replace("/")
  fail:    restorePosts(snapshot) + toast; no navigation
```
- Detail page stays safe while removed: `PostDetailMain` renders `null` for a missing store post and `notFound()` depends only on the fetch result (verified 2026-10-06).

## 5. UI / Components

### 5.1 Feed pill (1.4)
- `posts/hooks/use-new-posts-stream.ts`: subscribe while mounted & `visibilityState === "visible"`; `visibilitychange` -> unsubscribe / resubscribe. On post: `bufferIncoming(post)` + `void ensureUser(post.user.id)`.
- `posts/components/new-posts-pill.tsx`: reads `usePendingFeed(activeTab)`; hidden when `!loaded || (ids.length === 0 && !overflow)`.
  - Position: wrapper `sticky top-14 h-0 z-10` under 56px header + inner `absolute` centered -> 0 layout space (no CLS)
  - Look: rounded-full, `bg-white/80 dark:bg-zinc-900/80 backdrop-blur`, thin zinc border, shadow; 3 stacked avatars (`-space-x-2`, ring), label `feed.newPosts` (`{n}` or `20+`), `ArrowUp` icon; min-h 44px
  - Enter: `animate-in fade-in slide-in-from-top-2` (tw-animate-css), `motion-reduce:animate-none`; `aria-live="polite"` region
  - Click: overflow -> `loadPage(tab, 1)` (+ `consumeIncoming`); else `flushPending(tab, ids)`. Then `scrollFeedToTop()` (D15: document scroll -> `window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" })`)
- Every successful page-1 load (first load, Refresh, overflow) runs `consumeIncoming(tab, getPendingFeed(...).ids)`. Composer `prependPost` dedupes by id (own posts never come from the stream).

### 5.2 Owner actions (1.5)
- `post-card-menu.tsx` (split from `PostCard`):
  - Owner: Edit, Pin/Unpin (root only), Hide/Show like count, separator, Delete (red, last). All disabled while `useOwnerOp(id)` set.
  - Non-owner: existing items (Save, Not interested, Mute, Block, Copy link, Report) kept as toasts (real impl in 2.5 / 6.5), strings moved to i18n.
  - Hidden on `isPending` posts.
- `post-inline-editor.tsx`: replaces content block while editing; autosize textarea, autofocus, caret at end; counter `n/500` (same limit as `postSchema`); Cancel / Save; `Esc` cancel, `Ctrl/Cmd+Enter` save; Save disabled when unchanged, or empty with no images, or op pending.
- Labels: "· Đã chỉnh sửa" after timestamp when `isEdited`; pinned badge (`Pin` icon + `card.pinned`) above header in `feed`/`detail` variants.
- Hidden like count: non-owner sees no number; owner sees number + small `EyeOff` with tooltip `card.likesHiddenHint`.
- Delete `AlertDialog`: title `card.deleteTitle`, description, Cancel / Delete (destructive). Confirm -> run delete (§4.7) -> toast `card.deleteSuccess`.
  - **Root delete (in a list):** root + cached replies vanish everywhere; service `deletedIds` tombstoned.
  - **Reply delete (in a thread, not the viewed post):** reply (+ its children) removed; parent `commentsCount - 1`; stays on page.
  - **Viewed post or its ancestor:** removed optimistically too; navigate to `/` ONLY after the service resolves; failure -> restored in place + toast, no navigation.
  - Dialog closes on confirm in all modes (owner lock prevents a 2nd delete).

### 5.3 User hover card (1.6)
- `components/ui/hover-card.tsx`: shadcn primitive over `radix-ui` `HoverCard` (flat, no domain logic).
- `profile/components/user-hover-card.tsx` (barrel export): wraps avatar link & name link in `PostCard`; `openDelay 500`, `closeDelay 150`.
  - `const user = useUser(id)` (store subscription); local state = `status: "idle" | "loading" | "error"` ONLY.
  - On open: `user` missing -> `ensureUser(id)`; error -> one line + Retry.
  - Content (w-72): avatar 48, name + verified, @username, bio via `parseBio`, followers / following counts (compact format), `FollowButton` (hidden for self). Loading skeleton same size.
- `PostCard` header Follow -> `FollowButton userId={post.user.id}` (hidden for self). Remove `isAuthorFollowing` / `onAuthorFollowToggle` props + local state/effect; `profile-container.tsx` drops those props (profile header keeps its own follow).

### 5.4 `PostCard` split
- `post-card.tsx` (678 lines) -> `post-card.tsx` (layout + actions toolbar), `post-card-menu.tsx`, `post-media-grid.tsx`, `post-lightbox.tsx`, `post-inline-editor.tsx`. Like/bookmark/share behavior & DOM unchanged.

## 6. i18n

- **Domains:** `feed.*` (pill), `card.*` (owner menu, edited, pinned, hidden likes, delete dialog, forbidden, non-owner menu items), `hoverCard.*`

## 7. Edge Cases

| Case | Behavior |
|---|---|
| Edit reject after another field changed | Only edit fields reverted, and only if still optimistic value |
| 2nd owner action while 1st pending | Menu items & editor Save disabled; runner guard returns early |
| Non-owner calls service directly | `ForbiddenError`, no write |
| Pin a reply | Menu hides Pin; service rejects |
| Remove pinned post | Index entry cleared in same `set()` |
| Follow author while their post is pending | Appears in "Đang theo dõi" pending at read time |
| Post flushed into "Dành cho bạn", author followed later | Still unconsumed for following -> becomes pending there (consumed ids are per tab) |
| 21st incoming | Oldest dropped; its author recorded per unconsumed tab -> pill "20+" only for tabs it belongs to (read-time); click refetches page 1 |
| Delete succeeds, service returns uncached descendants | All `deletedIds` tombstoned -> never reappear via later fetch/upsert |
| Delete of viewed post fails | Post restored in place, no navigation, toast |
| Following tab before follow graph loaded | Following pending list empty (never classified from partial cache) |
| Viewer switches account | `follows[viewerId]` separate -> no `isFollowing` leak between viewers |
| Viewer A follows X, then guest/other viewer | Follow graph & `user-store` projection separate per viewer |
| Tab not loaded | Pill hidden; first load fetches incl. generated posts |
| Browser tab hidden / feed unmounted | Stream unsubscribed; last unsubscribe stops timer |
| Deleted post in search/saved list | Tombstone -> card renders `null` |
| Hover card on touch | No card (Radix `excludeTouch`); tap follows the link to `/@username` |
| Follow in hover card | `user-store` -> header button, sidebar, counts update together |

## 8. Testing (TDD, Vitest + RTL)

| File | Cases |
|---|---|
| `mocks/follow-graph.test.ts` | unknown viewer lazily seeded; set/unset per viewer; viewers isolated; self-follow ignored; reset |
| `posts/utils/pending-feed.test.ts` | excludes consumed per tab; following filter uses passed follow set (follow later -> becomes pending); post consumed in forYou still pending in following; overflow only when dropped author classified into tab |
| `posts/utils/feed-tabs.test.ts` | reply -> `[]`; root followed -> both; not followed -> forYou |
| `posts/utils/like-visibility.test.ts` | owner sees; non-owner null when hidden; not hidden -> count |
| `posts/services/post-service.test.ts` (extend) | **Timer lifecycle (fake timers):** 0 subscribers -> no timer; 1st -> starts; 2nd -> same timer, no duplicate emit; unsubscribe one -> continues; last -> stops; resubscribe -> exactly one timer. Generated post in `db` + emitted to all. **Randomness:** contract = 1-2 posts per tick at 45s ±10s; deterministic case `Math.random() = 0.5` -> exactly 45_000ms & 2 posts (a test case, not the contract); bounds checked with `0` (35_000ms, 1 post) & `0.999` (~55_000ms, 2 posts). `__resetMockDb()` resets db, `idCounter`, listeners & timer (isolation test). **Authorization:** edit/delete/pin/hideLikeCount by non-owner -> `ForbiddenError`, no write. deletePost removes subtree & decrements parent; pin unpins previous; pin reply rejects; `fetchFeed("following")` reflects `setFollowed` |
| `profile/services/user-service.test.ts` (extend) | `fetchUser` hit/miss; `fetchFollowedIds` complete per viewer; `isFollowing` derived per viewer; `setFollow` updates that viewer's graph only, `followersCount` global ±1 |
| `profile/store/user-store.test.ts` (extend) | viewer isolation (toggle as v1 -> v2 projection unchanged, shared `followersCount` ±1); `setFollowedIds` ignored when version moved; `ensureUser` no fetch when cached, dedupes in-flight; `ensureFollowGraph` once per viewer |
| `posts/store/post-store.test.ts` (extend) | buffer: dedupe vs feed/incoming/tombstone, cap 20 records dropped author only for unconsumed tabs & prunes consumed; flush prepends & consumes ONLY given ids for that tab; `consumeIncoming` clears dropped authors; `markDeleted` tombstones uncached ids & blocks later upsert/buffer/setReplies, clears pin index of a cached pinned id; `restorePosts` twice = once (no duplicate ids, count +1 once) & removes restored ids from `deletedIds`; page-1 `setFeedPage` consumes `ids ∩ incoming` & clears `droppedAuthorIds[tab]`; edit; **pin:** new pin unpins old, index updated, unpin clears, remove pinned clears index, `upsertPosts` reindexes; remove root (subtree, all lists, tombstone) & reply (parent count); `restorePosts` exact inverse; `patchPostIf` applies only on match; owner lock begin/end |
| `posts/hooks/use-owner-actions.test.tsx` | edit reject reverts content but keeps concurrent `hideLikeCount`; 2nd op while pending ignored; Forbidden -> toast key; delete success -> `markDeleted(deletedIds)`; **viewed-route delete:** removed optimistically, `router.replace("/")` NOT called before resolve, called after success; failure -> restored in place, no navigation |
| `posts/components/new-posts-pill.test.tsx` | hidden at 0 / not loaded; count + avatars; "20+" on overflow; click flushes + `scrollFeedToTop()`; overflow click refetches + consumes; following tab counts only followed authors at read time, empty while follow graph not loaded |
| `posts/components/post-inline-editor.test.tsx` | Esc cancel; Ctrl+Enter save; Save disabled unchanged/empty/pending; counter |
| `posts/components/post-card-menu.test.tsx` | owner vs non-owner items; Pin hidden on reply; items disabled while op pending; delete confirm flow |
| `posts/components/post-card.test.tsx` | tombstoned -> null; hidden like count per viewer; edited label; pinned badge |
| `profile/components/user-hover-card.test.tsx` | skeleton -> data; cached -> no fetch; Follow hidden for self; `fetchUser` null -> error + Retry; **touch:** `pointerEnter` with `pointerType: "touch"` -> no card, trigger is a link to `/@username`; **follow in card -> `PostCard` header button + card follower count update** |

- Tests rendering async containers MUST await first fetch before ending (post-detail pitfall).
- Verification: `npm run test`, `npm run typecheck`, `npm run lint` (0 new errors); browser pass (temporarily lower interval in dev): pill appears & flushes, edit/delete/pin/hide on own new post, hover card + follow sync; 375/768/1440, light & dark, keyboard focus.

## 9. Out of Scope

- Real API/SignalR, profile pinned ordering & profile on mocks (F0.6 / 2.1), real Mute/Block/Report (2.5 / 6.5), editing images, edit history, undo delete, hover card on touch (long-press), notifications for new posts (3.3)
