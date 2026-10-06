# Feed & Post Interaction - Design Spec

- **Date:** 2026-10-06
- **Status:** approved in brainstorming (incl. review round 1), pending spec review
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
| D4 | Push cadence | `setTimeout` chain, 45s ±10s random per tick, 1-2 posts, both tabs, paused while `document.hidden` or feed unmounted |
| D5 | Buffer cap | 20 incoming entries; overflow -> pill "20+", click = refetch page 1 |
| D6 | Pin scope | Store + service `isPinned` + "Đã ghim" badge; profile ordering deferred to F0.6 / 2.1. Root posts ONLY |
| D7 | Delete | Confirm `AlertDialog` only (Threads-style), no undo |
| D8 | Edit | Inline autosize textarea, text only (images unchanged), no time limit |
| D9 | Ownership | Enforced by service (`actorId` arg, `ForbiddenError`); UI visibility is only presentation |
| D10 | Concurrency | Max 1 pending owner mutation per post (`ownerOpById`) + field-scoped conditional rollback |
| D11 | Follow source | `src/mocks/follow-graph.ts` = mock backend table; feed tab classification via pure `getPostFeedTabs`; client classifies pending posts at read time from `user-store` |
| D12 | Seed "me" post | NO seed (current user id varies: login "1", register "2", guest "me"); demo via composer |
| D13 | Hover card data | Subscribes `useUser(id)`; `ensureUser(id)` fetches only when not cached; touch devices -> link navigates, no card |

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
NewPostsPill <── usePendingFeed(tab) = incoming ∩ cursor[tab] ∩ getPostFeedTabs(post, followed from user-store)
     click ──> flushPending(tab, ids)  |  overflow[tab] -> loadPage(tab, 1)

PostCardMenu (owner) ──> runOwnerOp(postId, op): lock -> optimistic store update -> service(actorId) -> commit | field rollback -> unlock
UserHoverCard ──> useUser(id) + ensureUser(id) ──> FollowButton (user-store) <── PostCard header
```

- Swap point for real API/SignalR: service bodies + `useNewPostsStream` subscription ONLY; UI & stores unchanged.

### 4.1 Shared mocks (`src/mocks/`) - breaks import cycle

- **Problem:** `profile/mocks/mock-users.ts` imports `MOCK_AUTHORS` from barrel `@/features/posts`. `PostCard` will import `@/features/profile` (hover card, `FollowButton`) -> cycle `posts -> profile -> mock-users -> posts` -> TDZ error on top-level `MOCK_AUTHORS.map`.
- **Fix:**
  - `src/mocks/seed-authors.ts`: `SEED_AUTHORS` (moved from `posts/mocks/mock-authors.ts`, `import type { PostAuthor }` only) + `SEED_FOLLOWED_AUTHOR_IDS`
  - `src/mocks/follow-graph.ts`: mock backend follow table
    ```ts
    export function getFollowedAuthorIds(): ReadonlySet<string>;
    export function setFollowed(authorId: string, following: boolean): void;
    export function __resetFollowGraph(): void; // test-only, re-seed from SEED_FOLLOWED_AUTHOR_IDS
    ```
  - `posts/mocks/mock-posts.ts`, `profile/mocks/mock-users.ts` read `@/mocks/seed-authors`; `posts` barrel stops exporting `MOCK_AUTHORS` / `MOCK_FOLLOWED_AUTHOR_IDS`
  - `user-service.setFollow` writes `follow-graph` (+ its own `isFollowing`/`followersCount`); `post-service` reads it. NO second follow copy in `post-service`.
- **Remaining barrel cycle** `profile-container -> @/features/posts` vs `PostCard -> @/features/profile` is safe ONLY because cross-feature values are referenced at render/call time. Rule: NO top-level (module-evaluation) use of another feature's exported values.

### 4.2 Types (`posts/types`)

```ts
export interface PostItem {
  // ...existing
  isPinned?: boolean;
  hideLikeCount?: boolean;
}

export type OwnerOp = "edit" | "delete" | "pin" | "hideLikeCount";

export interface IncomingPost { id: string; seq: number; } // seq = monotonic arrival order
```

- `ForbiddenError` class in `posts/services/post-service.ts` (exported via barrel), `name = "ForbiddenError"`.

### 4.3 Pure utils (`posts/utils/`)

- `feed-tabs.ts`: `getPostFeedTabs(post, followedAuthorIds: ReadonlySet<string>): FeedTab[]` -> replies `[]`; root `["forYou"]` + `"following"` when author followed. Used by `fetchFeed` AND pending selector.
- `like-visibility.ts`: `getVisibleLikeCount(post, viewerId): number | null` -> `null` when `hideLikeCount && post.user.id !== viewerId`. EVERY render of a like count goes through it (`PostCard` all variants, detail stats row, `aria-label`). Ranking by likes (search Top, tag Top) still uses raw `likesCount` server-side; the number is never exposed.

### 4.4 `post-service` (mock)

| Function | Behavior |
|---|---|
| `fetchFeed(tab, page)` | Filter roots with `getPostFeedTabs(post, getFollowedAuthorIds())` (fixes static `MOCK_FOLLOWED_AUTHOR_IDS` bug) |
| `subscribeToNewPosts(listener: (post: PostItem) => void): () => void` | Ref-counted shared timer. 1st subscriber -> schedule; each tick: generate 1-2 root posts from `MOCK_INCOMING_CONTENTS` (new mock) by random `SEED_AUTHORS`, write to `db`, emit copies to every listener, schedule next `setTimeout(NEW_POST_INTERVAL_MS ± NEW_POST_JITTER_MS)`. Last unsubscribe -> `clearTimeout`. Unsubscribe idempotent |
| `updatePostContent(id, content, actorId)` | Owner only; sets `content`, `isEdited = true`; returns copy |
| `deletePost(id, actorId)` | Owner only; removes post + all descendants; reply -> parent `commentsCount - 1`; returns `{ deletedIds: string[] }` |
| `setPostPinned(id, pinned, actorId)` | Owner only; root only (reply -> reject `Error`); pin -> unpin author's previous pinned post |
| `setHideLikeCount(id, hidden, actorId)` | Owner only |

- Unknown id -> reject `Error("not found")`; `post.user.id !== actorId` -> reject `ForbiddenError`. Check happens BEFORE any write.
- Constants: `NEW_POST_INTERVAL_MS = 45_000`, `NEW_POST_JITTER_MS = 10_000` (exported for tests / dev tuning).
- Test-only `__resetMockDb()` also stops the stream timer & clears listeners.

### 4.5 `user-service` (mock)

- `fetchUser(id): Promise<UserProfile | null>` (exported via `@/features/profile`).
- `setFollow` also calls `setFollowed` on `follow-graph`.
- `user-store` gains `ensureUser(id): Promise<void>` helper (module fn, not action): no-op when cached; dedupes in-flight requests per id (`Map<id, Promise>`); upserts result.

### 4.6 `post-store`

New data:

```ts
incoming: IncomingPost[];                       // newest first, max INCOMING_CAP = 20
incomingSeq: number;                            // last assigned seq
incomingCursor: Record<FeedTab, number>;        // last seq flushed into that tab
incomingOverflow: Record<FeedTab, boolean>;     // tab missed entries dropped by cap
pinnedIdByAuthor: Record<string, string>;       // authorId -> pinned root post id (cached posts only)
ownerOpById: Record<string, OwnerOp>;           // 1 pending owner mutation per post
deletedIds: Record<string, true>;               // tombstones
```

- `feedMeta[tab].loaded` (existing) is the per-tab loaded flag.

New actions (each ONE `set()`):

| Action | Behavior |
|---|---|
| `bufferIncoming(post)` | Skip if id already in `incoming`, in any `feedIds[tab]`, or tombstoned. Upsert post, `seq = ++incomingSeq`, prepend. If length > 20: drop oldest; for each tab whose `cursor < droppedSeq` -> `overflow[tab] = true`. Buffered regardless of `loaded`; pill hidden until tab loaded |
| `flushPending(tab, ids)` | `feedIds[tab] = [...ids, ...feedIds[tab] minus ids]`; `cursor[tab] = incomingSeq`; `overflow[tab] = false`. `ids` = selector result (classification stays out of the store) |
| `setFeedPage(tab, ids, append=false, ...)` (existing, extended) | Also `cursor[tab] = incomingSeq`, `overflow[tab] = false` -> page-1 load/refetch already contains buffered posts, so they never show as pending duplicates |
| `beginOwnerOp(id, op)` / `endOwnerOp(id)` | Set / clear lock; `beginOwnerOp` returns `false` when a lock exists |
| `editPost(id, content)` | `content`, `isEdited = true` |
| `removePost(id)` | Collect subtree via `replyIds` (cached); delete from `posts`, all `feedIds`, `incoming`, `replyIds[parent]` (+ parent `commentsCount - 1` if reply), `replyIds[x]` of removed; clear `pinnedIdByAuthor` entry if pinned; add tombstones. Returns snapshot for rollback |
| `restorePosts(snapshot)` | Rollback of `removePost`: re-insert posts, list positions, parent count, pin index; drop tombstones |
| `setPinned(id, pinned)` | Pin: unpin `pinnedIdByAuthor[author]` (if other & cached) + pin target + index. Unpin: clear flag + index entry |
| `setHideLikeCount(id, hidden)` | Toggle flag |
| `patchPostIf(id, expected, patch)` | Field-scoped rollback: apply `patch` only when every key of `expected` still equals current value |

- **Pin index invariant (cached posts):** `pinnedIdByAuthor[a] === id` <=> `posts[id].isPinned === true && posts[id].user.id === a`. Maintained by helper `reindexPins(state, incomingPosts)` inside `upsertPosts`, `prependPost`, `bufferIncoming`, `addReply` (reply never pinned) and by `setPinned`, `removePost`, `restorePosts`. Init `{}`.
- Tombstones: `PostCard` returns `null` when `deletedIds[id]` -> deleted post disappears from lists holding their own props (search, saved, tag). `upsertPosts` skips tombstoned ids.
- Selectors: `usePendingFeed(tab): { ids: string[]; authors: PostAuthor[]; overflow: boolean }` (combines `post-store` incoming + `user-store` follow; `useShallow` per store + `useMemo`; O(20)), `useOwnerOp(id)`, `useIsDeleted(id)`.

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
| delete | whole subtree | `restorePosts(snapshot)` (card gone -> no concurrent op on it) |

## 5. UI / Components

### 5.1 Feed pill (1.4)
- `posts/hooks/use-new-posts-stream.ts`: subscribe while mounted & `visibilityState === "visible"`; `visibilitychange` -> unsubscribe / resubscribe. On post: `bufferIncoming(post)` + `void ensureUser(post.user.id)`.
- `posts/components/new-posts-pill.tsx`: reads `usePendingFeed(activeTab)`; hidden when `!loaded || (ids.length === 0 && !overflow)`.
  - Position: wrapper `sticky top-14 h-0 z-10` under 56px header + inner `absolute` centered -> 0 layout space (no CLS)
  - Look: rounded-full, `bg-white/80 dark:bg-zinc-900/80 backdrop-blur`, thin zinc border, shadow; 3 stacked avatars (`-space-x-2`, ring), label `feed.newPosts` (`{n}` or `20+`), `ArrowUp` icon; min-h 44px
  - Enter: `animate-in fade-in slide-in-from-top-2` (tw-animate-css), `motion-reduce:animate-none`; `aria-live="polite"` region
  - Click: overflow -> `loadPage(tab, 1)` (cursor reset via `setFeedPage`); else `flushPending(tab, ids)`. Then `window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" })`
- Refresh button: page-1 `setFeedPage` resets cursor. Composer `prependPost` dedupes by id (own posts never come from the stream).

### 5.2 Owner actions (1.5)
- `post-card-menu.tsx` (split from `PostCard`):
  - Owner: Edit, Pin/Unpin (root only), Hide/Show like count, separator, Delete (red, last). All disabled while `useOwnerOp(id)` set.
  - Non-owner: existing items (Save, Not interested, Mute, Block, Copy link, Report) kept as toasts (real impl in 2.5 / 6.5), strings moved to i18n.
  - Hidden on `isPending` posts.
- `post-inline-editor.tsx`: replaces content block while editing; autosize textarea, autofocus, caret at end; counter `n/500` (same limit as `postSchema`); Cancel / Save; `Esc` cancel, `Ctrl/Cmd+Enter` save; Save disabled when unchanged, or empty with no images, or op pending.
- Labels: "· Đã chỉnh sửa" after timestamp when `isEdited`; pinned badge (`Pin` icon + `card.pinned`) above header in `feed`/`detail` variants.
- Hidden like count: non-owner sees no number; owner sees number + small `EyeOff` with tooltip `card.likesHiddenHint`.
- Delete `AlertDialog`: title `card.deleteTitle`, description, Cancel / Delete (destructive). Confirm -> run delete -> toast `card.deleteSuccess`.
  - **Root delete:** removes root + cached replies everywhere.
  - **Reply delete:** removes reply (+ its children); parent `commentsCount - 1`; stays on page.
  - **Navigation:** if current `/posts/[x]` has `x` in removed subtree (root being viewed, or parent of the viewed reply) -> `router.replace("/")`.

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
| Post flushed before following its author | Not re-added to following pending (refetch shows it) |
| 21st incoming | Oldest dropped, pill "20+", click refetches page 1 |
| Tab not loaded | Pill hidden; first load fetches incl. generated posts |
| Browser tab hidden / feed unmounted | Stream unsubscribed; last unsubscribe stops timer |
| Deleted post in search/saved list | Tombstone -> card renders `null` |
| Hover card on touch | No card; tap navigates to profile |
| Follow in hover card | `user-store` -> header button, sidebar, counts update together |

## 8. Testing (TDD, Vitest + RTL)

| File | Cases |
|---|---|
| `mocks/follow-graph.test.ts` | seed, set/unset, reset |
| `posts/utils/feed-tabs.test.ts` | reply -> `[]`; root followed -> both; not followed -> forYou |
| `posts/utils/like-visibility.test.ts` | owner sees; non-owner null when hidden; not hidden -> count |
| `posts/services/post-service.test.ts` (extend) | **Timer lifecycle (fake timers):** 0 subscribers -> no timer; 1st -> starts; 2nd -> same timer, no duplicate emit; unsubscribe one -> continues; last -> stops; resubscribe -> exactly one timer. Generated post in `db` + emitted to all. **Authorization:** edit/delete/pin/hideLikeCount by non-owner -> `ForbiddenError`, no write. deletePost removes subtree & decrements parent; pin unpins previous; pin reply rejects; `fetchFeed("following")` reflects `setFollowed` |
| `profile/services/user-service.test.ts` (extend) | `fetchUser` hit/miss; `setFollow` updates follow graph |
| `profile/store/user-store.test.ts` (extend) | `ensureUser` no fetch when cached; dedupes in-flight |
| `posts/store/post-store.test.ts` (extend) | buffer: dedupe vs feed/incoming/tombstone, cap 20 + overflow per tab cursor; flush prepends & advances cursor; page-1 `setFeedPage` resets cursor + overflow; edit; **pin:** new pin unpins old, index updated, unpin clears, remove pinned clears index, `upsertPosts` reindexes; remove root (subtree, all lists, tombstone) & reply (parent count); `restorePosts` exact inverse; `patchPostIf` applies only on match; owner lock begin/end |
| `posts/hooks/use-owner-actions.test.tsx` | edit reject reverts content but keeps concurrent `hideLikeCount`; 2nd op while pending ignored; Forbidden -> toast key |
| `posts/components/new-posts-pill.test.tsx` | hidden at 0 / not loaded; count + avatars; "20+" on overflow; click flushes + scrolls; following tab counts only followed authors at read time |
| `posts/components/post-inline-editor.test.tsx` | Esc cancel; Ctrl+Enter save; Save disabled unchanged/empty/pending; counter |
| `posts/components/post-card-menu.test.tsx` | owner vs non-owner items; Pin hidden on reply; items disabled while op pending; delete confirm flow |
| `posts/components/post-card.test.tsx` | tombstoned -> null; hidden like count per viewer; edited label; pinned badge |
| `profile/components/user-hover-card.test.tsx` | skeleton -> data; cached -> no fetch; Follow hidden for self; **follow in card -> `PostCard` header button + card follower count update** |

- Tests rendering async containers MUST await first fetch before ending (post-detail pitfall).
- Verification: `npm run test`, `npm run typecheck`, `npm run lint` (0 new errors); browser pass (temporarily lower interval in dev): pill appears & flushes, edit/delete/pin/hide on own new post, hover card + follow sync; 375/768/1440, light & dark, keyboard focus.

## 9. Out of Scope

- Real API/SignalR, profile pinned ordering & profile on mocks (F0.6 / 2.1), real Mute/Block/Report (2.5 / 6.5), editing images, edit history, undo delete, hover card on touch (long-press), notifications for new posts (3.3)
