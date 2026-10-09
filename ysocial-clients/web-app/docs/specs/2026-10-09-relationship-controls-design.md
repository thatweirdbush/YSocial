# Relationship Controls - Design Spec

- **Date:** 2026-10-09
- **Status:** approved design, pending written-spec review
- **Roadmap:** `.context/features/frontend-roadmap.md` -> Phase 2 sub-project **2B**: 2.3 (private account & follow requests) + 2.4 (close friends) + 2.5 (block / mute). Restrict deferred (D1)
- **Scope rule:** FE ONLY, mock data. NO BE/API/DB calls. Mock services mirror BE domain shapes (`UserRelation`, `UserBlock`, `PrivacySettings`) so swapping to real API touches services only

## 1. Goal

- Viewer can make account private, approve/decline follow requests; follow to private account becomes `pending`
- Viewer can block / mute users from `PostCard` menu & profile; content is actually hidden (not toast only)
- Viewer can mark close friends; author can publish close-friends-only posts shown with green ring + label
- Manager lists (requests, blocked, muted, close friends) are reusable components mounted in minimal `/settings` shell (4.1 extends it)
- All lists, feeds, search, tags, thread & profile respect one visibility contract, enforced by mock services before pagination

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Restrict | Deferred: BE has no concept. Roadmap 2.5 notes "Restrict deferred" |
| D2 | Manager mount | Minimal `/settings` shell now: `privacy`, `blocked`, `muted`, `close-friends`. Sidebar dropdown gets "Settings" item. 4.1 adds remaining routes |
| D3 | Follow requests entry | `FollowRequestsBanner` at top of `/notifications` -> `/settings/privacy#requests`. Hidden when count = 0 |
| D4 | Enforcement layer | Hybrid: mock services filter (source of truth, before pagination, mirrors D9 of feed spec); stores hide instantly after mute/block. Replaces roadmap wording "content filtering in `post-store` selectors" (client-only filter gives short pages & leaks private posts) |
| D5 | Follow command semantics | 2 explicit commands mirroring BE `POST/DELETE /relations/follow`: `followUser(targetId)` (idempotent: none -> pending/accepted; pending/accepted -> no-op) & `unfollowUser(targetId)` (accepted/pending -> none; none -> no-op). Clicking "Requested" = `unfollowUser` (cancel). Store sets explicit target status, NEVER toggles. Block cleanup sets explicit `none`, NEVER toggle |
| D6 | Close-friend direction | Edge `observer -> target` with `isCloseFriend` = observer marked target. Client projection named `viewerMarkedCloseFriend` (viewer -> target). Post visibility uses `isMarkedBy(authorId, viewerId)` (author -> viewer) inside `visibility.ts` ONLY; no client projection for that direction (viewer seeing the post already implies it; badge comes from `post.visibility`) |
| D7 | Close-friend activation | Effective ONLY when edge status = `accepted` AND `isCloseFriend`. Unfollow / block keep `isCloseFriend` **dormant** (BE soft-delete parity); re-follow reactivates. Dormant flag NEVER grants post visibility & never appears in close-friend list |
| D8 | Visibility rules split | `canDiscoverUser`, `canViewProfile`, `canViewPost` in `src/mocks/visibility.ts`. Private accounts stay discoverable (search, suggestions, lists) so users can request follow |
| D9 | Viewer identity in visibility | Services keep `actorId` param (existing convention, profile spec D9). Normalized at service boundary by `asViewer(actorId): string \| null` (`GUEST_ACTOR_ID` -> `null`) before `can*` calls. Guest = sees public non-close-friends content only. Guest writes requiring identity (block, mute, close friend, privacy, follow to private account, respond request) -> `ForbiddenError`; UI hides those entry points for guest |
| D10 | Post visibility field | NEW `PostItem.visibility?: "public" \| "closeFriends"` (absent = `public`). Existing `PostAudience` is reply permission ("Anyone can reply"), NOT visibility -> untouched & still not enforced. Composer gets separate close-friends toggle (D23). BE gap: `CreatePostRequest` has no visibility field (recorded §11) |
| D11 | Mute semantics | Mute hides author from home feeds (`forYou`, `following`) & new-post stream/pill ONLY. Profile, thread, search, tags still show. Muting a followed user keeps follow (counts unchanged) |
| D12 | Block semantics | Bidirectional hide everywhere (`canDiscoverUser` false, `canViewPost` false both directions). Block purges follows & pending requests BOTH directions (explicit `none`), keeps `isCloseFriend` dormant (D7), keeps mute flag. Unblock does NOT restore follows |
| D13 | Blocked profile route | `resolveProfileRoute` (server) cannot see client mock graph -> NO 404 for block. Profile renders state: viewer blocked target -> "You blocked @x" + Unblock; target blocked viewer -> "Profile unavailable" |
| D14 | Private profile view | Private & viewer not accepted & not owner -> header + counts visible, tabs replaced by locked `EmptyState`, followers dialog not openable |
| D15 | Private -> public | Auto-accepts every pending request. O(k) for k requests; each edge update goes through single write point (D17) -> indexes consistent. Confirm dialog shows k. Client refetches request count + own user after success |
| D16 | Code placement | Relation service & store live in `features/profile` (`services/relation-service.ts`, `store/relation-store.ts`) - separate `relations` feature would create `relations <-> profile` cycle (needs `user-store`). Settings UI = new `features/settings` (imports `@/features/profile` barrel). `notifications` -> `profile` barrel (banner). No new cycle |
| D17 | Mock authority | `src/mocks/relation-graph.ts` = sole relation truth (replaces `follow-graph.ts`); `block-graph.ts`, `privacy.ts` beside it. Every edge mutation through ONE internal `writeEdge` keeping 3 indexes in sync. Zustand stores = viewer-scoped optimistic projection ONLY |
| D18 | Write ordering | Mock writes apply synchronously at call (before latency) -> graph order = click order. For real API: per-relationship serial queue `(actorId, targetId)` in store commit helpers (promise chain); reconciliation applies only when op version still latest (existing `commitFollow` pattern) |
| D19 | Request response API | `respondFollowRequest(requesterId, decision: "accept" \| "decline", actorId)`. Decline = requester edge -> `none` (no notification) |
| D20 | Author exclusion in `post-store` | `excludedAuthors: Record<authorId, { muted?: true; blocked?: true }>`. `excludeAuthor(id, reason)` / `includeAuthor(id, reason)` remove ONLY given reason; entry deleted when empty. Feeds/incoming skip any excluded author; replies skip `blocked` only. Unblock/unmute never restores removed ids -> next page-1 load brings them back. `PostCard` null guard on blocked author = fallback for prop-held lists (search, saved, tag) ONLY |
| D21 | Seed | See §4.2. Demo `1` is private with 4 pending requests (approved trade-off: guest cannot see demo tabs) |
| D22 | Settings layout | `MainLayout` gets optional `aside?: ReactNode`; on `lg+` `SettingsNav` replaces `RightSidebar` (center column keeps 600px). `/settings` = nav list page on every size; below `lg` child routes show Back header |
| D23 | Close-friends badge | Avatar `ring-2 ring-emerald-500` + small "Close friends" label (Lucide `Star`). Emerald = semantic exception to "1 accent" rule (recorded in FE conventions on closure) |

## 3. Global Constraints

- Same stack/rules as profile-core spec §3: Next.js 16, React 19, TS strict, Tailwind v4, Zustand 5, shadcn/Radix, Lucide ONLY, no new deps
- Cross-feature imports via barrels, used at render/call time only (feed spec I9)
- Touch targets >= 44px, icon buttons `aria-label`, `motion-reduce`, no `hover:scale-*`
- Store updates touching >1 entity in 1 `set()`
- NO `as any` in new/touched files; i18n keys flat `domain.elementName`, vi + en
- Private routes `robots: { index: false }`

## 4. Architecture & Data Flow

```
UI (FollowButton / PostCardMenu / ProfileHeaderMenu / Settings lists / Banner)
  -> profile/store helpers: commitFollow(next) | commitBlock | commitMute | commitCloseFriend | commitPrivacy | respondRequest
       optimistic: user-store.setFollowStatus / relation-store / post-store.excludeAuthor   (1 set() each)
       serial queue per (actorId, targetId)
  -> profile/services: user-service.followUser|unfollowUser, relation-service.*   (actorId, ForbiddenError for guest)
  -> src/mocks: relation-graph.writeEdge | block-graph | privacy   (sync write, then mockDelay)
  -> reconcile: refreshUsers / reload list when op version still latest

Reads: post-service.* & user-service.* -> visibility.ts (asViewer(actorId)) -> filter -> paginate
```

### 4.1 Mock backend (`src/mocks/`)

```ts
// relation-graph.ts
type FollowStatus = "none" | "pending" | "accepted";        // BE FollowStatus
interface RelationEdge { status: FollowStatus; isCloseFriend: boolean; isMuted: boolean }
edges: Map<observerId, Map<targetId, RelationEdge>>
followers: Map<targetId, Set<observerId>>   // accepted only
requests:  Map<targetId, Set<observerId>>   // pending only
```
- `writeEdge(observer, target, patch)`: ONLY mutation point; updates edge + both reverse indexes; self-edge ignored; O(1) per edge
- Exports: `getEdge`, `getFollowStatus`, `getFollowedIds` (accepted), `getFollowerIds`, `getRequestIds`, `getFollowerCount` / `getFollowingCount` (accepted only), `requestFollow(observer, target, targetPrivate)`, `removeFollow`, `setCloseFriend` (throws unless accepted), `setMuted`, `acceptAllRequests(target)` (O(k)), `getCloseFriendIds(observer)` (accepted + flag), `getMutedIds`, `__resetRelationGraph`
- Lazy materialization of unknown observer with `SEED_FOLLOWED_AUTHOR_IDS` kept (accepted edges)
- `block-graph.ts`: `Map<blocker, Set<blocked>>`; `setBlocked(blocker, blocked, on)` -> on: `removeFollow` both directions (also pending), flags untouched. `isBlocked(a, b)`, `isEitherBlocked(a, b)`, `getBlockedIds`, `__reset`
- `privacy.ts`: `Map<userId, boolean>`; `isPrivate`, `setPrivate(id, value)` (false -> `acceptAllRequests`), `__reset`
- `visibility.ts`:
  - `asViewer(actorId)` -> `null` for `GUEST_ACTOR_ID`
  - `canDiscoverUser(viewer, userId)` = !(viewer && isEitherBlocked)
  - `canViewProfile(viewer, userId)` = viewer === userId OR (!isPrivate(userId) OR status(viewer -> userId) = accepted)
  - `isMarkedBy(authorId, viewer)` = edge(author -> viewer).status = accepted AND isCloseFriend
  - `canViewPost(viewer, post)` = canDiscoverUser(viewer, author) AND canViewProfile(viewer, author) AND (post.visibility != closeFriends OR viewer === author OR isMarkedBy(author, viewer))
  - `isMutedBy(viewer, authorId)` for feed/stream filters

### 4.2 Seed

| Seed | Purpose |
|---|---|
| `author-07` private, demo `1` none | Locked profile, Follow -> pending |
| `author-05` private, demo `1` pending | "Requested" button, cancel |
| Demo `1` private; pending from `author-02`, `author-08`, 2 fans | Banner + approval list |
| `author-03` (demo follows) follows demo accepted + marks demo close friend; 2 close-friends posts | Demo sees green ring |
| `author-02` 1 close-friends post, demo not marked | Demo does NOT see it |
| Demo marks `author-03` close friend; no blocks, no mutes | Lists non-empty |

- Seed edges consistent with BE rule: close friend only on accepted edges. `author-03 -> 1` accepted added to `SEED_FOLLOWING`
- Existing seed tests updated where counts change (accepted-only counting)

### 4.3 `user-service` (profile)

- `UserProfile` adds `isPrivate` (base, shared) + viewer projection `followStatus`, `viewerMarkedCloseFriend`, `isMuted`, `isBlocked` (viewer blocked), `isBlockedBy`. `isFollowing` kept = `followStatus === "accepted"`
- `setFollow` replaced by `followUser(id, actorId): Promise<FollowStatus>` & `unfollowUser(id, actorId): Promise<void>`; delegate to graph (D17). Guest follow to private -> `ForbiddenError`; blocked either way -> `ForbiddenError`
- `searchUsers`, `fetchSuggestedUsers`, `fetchFollowList` filter `canDiscoverUser`. `fetchFollowList` on non-viewable profile -> empty page (UI never opens it, D14)
- `fetchFollowedIds` returns accepted only

### 4.4 `relation-service` (profile, new)

| Fn | Notes |
|---|---|
| `setBlocked(id, on, actorId)` | D12; returns void |
| `setMuted(id, on, actorId)` | creates `none` edge when absent |
| `setCloseFriend(id, on, actorId)` | throws unless accepted (BE rule) |
| `setPrivate(on, actorId)` | D15; returns `{ acceptedCount }` |
| `fetchFollowRequests({ query, page }, actorId)` | requesters as `UserProfile[]`, newest-first by insertion, page 20 |
| `fetchFollowRequestCount(actorId)` | banner |
| `respondFollowRequest(requesterId, decision, actorId)` | D19 |
| `fetchBlockedUsers` / `fetchMutedUsers` / `fetchCloseFriendCandidates` | `{ query, page }`; candidates = accepted followees, `viewerMarkedCloseFriend` projected |
| `fetchRelationSets(actorId)` | `{ blocked, muted, closeFriends, isPrivate }` for `relation-store` load |

All writes: `ForbiddenError` for guest; apply sync then `mockDelay()`.

### 4.5 `post-service` (posts)

- `fetchUserPosts(userId, tab, page, actorId)` -> `{ ..., locked: boolean }` (`locked` = !canViewProfile; posts empty)
- `searchPosts(query, actorId, limit, sort)`, `fetchPostsByTag(tag, sort, actorId)`, `fetchPostThread(id, actorId)` (root !canViewPost -> null -> not-found; replies filtered), `fetchSavedPosts` filters too
- `fetchFeed` filters canViewPost + not muted
- `subscribeToNewPosts` is global (not viewer-scoped): generates ONLY `public` posts by public authors (privacy check at generation). Viewer-specific mute/block applied by `post-store.bufferIncoming` skipping `excludedAuthors` (populated at relation-set load, §4.6)
- `createPost(input, author)`: `CreatePostInput.visibility` -> `PostItem.visibility`. Replies never carry visibility; reply visible iff root visible (thread fetch) & own rules
- Filtering ALWAYS before `pageOf`/slice

### 4.6 Stores

- `user-store`: `ViewerFollows.ids` -> `status: Record<id, "pending" | "accepted">`; `known`/`loaded`/`version` unchanged (feed spec I11). Action `setFollowStatus(actorId, id, next)` replaces `toggleFollow` (explicit, ±1 counts only on accepted boundary). `useFollowState(id): FollowStatus | undefined`. `useFollowedIds` accepted only. `commitFollow(actorId, id, next: "follow" | "unfollow")`: optimistic status = target private ? pending : accepted
- `relation-store` (new): `byViewer: Record<actorId, { blocked, muted, closeFriends: Record<id, true>; isPrivate?: boolean; requestCount?: number; loaded; version }>`. Selectors `useIsBlocked`, `useIsMuted`, `useViewerMarkedCloseFriend`, `useIsPrivateAccount`, `useFollowRequestCount`. `ensureRelationSets(actorId)` deduped. Commit helpers optimistic + serial queue (D18) + rollback only if own op still latest
- `post-store`: `excludedAuthors` (D20), actions `excludeAuthor`, `includeAuthor`, `setExcludedAuthors(map)` (replace on viewer switch); `bufferIncoming` & `setFeedPage` skip excluded; selector `useIsAuthorBlocked(id)`
- `ensureRelationSets(actorId)` success -> `post-store.setExcludedAuthors` from blocked + muted sets (stream & feed exclusion valid from first load, not only after an action)
- Block commit (1 call): relation-store blocked + user-store `setFollowStatus(none)` for target + post-store `excludeAuthor(blocked)` -> reconcile `refreshUsers([id, actorId])`

## 5. Routes

```
app/settings/
├── layout.tsx            # MainLayout aside={<SettingsNav/>} (lg+), robots noindex
├── page.tsx              # SettingsIndex (nav list on every size; no viewport redirect -> no flicker)
├── privacy/page.tsx      # PrivacySettings + FollowRequestList (#requests)
├── blocked/page.tsx      # BlockedUserList
├── muted/page.tsx        # MutedUserList
└── close-friends/page.tsx# CloseFriendsList
```
- Pages thin, metadata in `page.tsx`. Guest -> settings pages show `EmptyState` with login CTA

## 6. UI / Components

- `features/settings/components/`: `settings-nav.tsx`, `settings-index.tsx`, `settings-page-header.tsx` (Back below lg), `privacy-settings.tsx` (Switch + AlertDialog for public with k)
- `features/profile/components/` (reusable, exported): `relation-user-list.tsx` (search debounced, paging "load more", row action slot, `EmptyState`, error + retry, skeleton rows), `follow-request-list.tsx` (Confirm / Delete), `blocked-user-list.tsx`, `muted-user-list.tsx`, `close-friends-list.tsx` (toggle per row, count), `follow-requests-banner.tsx` (3 stacked avatars + count), `profile-header-menu.tsx` (Block, Mute, Add/Remove close friends when accepted), `block-confirm-dialog.tsx` (shared by post menu & profile), `profile-locked-state.tsx` (private / blocked / unavailable variants)
- `FollowButton`: 3 states Follow / Requested / Following; `aria-pressed` for following; Requested click cancels without confirm; blocked target -> Unblock button
- `PostCardMenu` viewer: Mute/Unmute (toast + Undo), Block (confirm dialog). Hidden for guest & own posts
- `PostCard`: close-friends ring + label from `post.visibility`; null when author blocked (fallback)
- Composer (`post-creator-core.tsx`): close-friends toggle chip (Lucide `Star`), hidden for guest & reply mode; `onPostSubmitted` passes visibility
- `ProfileHeader`: lock icon next to name when private; menu for non-own
- Sidebar dropdown (`main-layout.tsx`): "Settings" item -> `/settings`
- `/notifications`: banner above list

## 7. i18n

Domains: `settings.*`, `relations.*` (block/mute/close friend/requests/locked), extended `card.*`, `profile.*`, `notifications.*`, `creator.*`. Full key list in plan

## 8. Edge Cases

- Block while viewer has pending request to target (or reverse) -> requests removed both ways, request count refetched
- Block followed user who marked viewer close friend -> dormant, post hidden (D7)
- Unblock -> follow stays none; posts return on next page-1 load
- Mute + block, then unblock -> still muted (D20)
- Mute followed user -> hidden from `following` tab but counted as followed; pending-feed classification skips excluded authors
- Unfollow close friend -> hidden from close-friend list; re-follow (public target) -> flag active again (regression test)
- Follow private -> pending -> owner accepts -> viewer's next refresh shows following + unlocked tabs
- Cancel request (Requested click) while request in flight -> serial queue keeps order
- Private -> public with k requests -> all accepted, counts +k, banner hidden
- Thread root becomes invisible after block -> detail shows not-found state on next fetch; open detail page store copy hidden via fallback
- Account switch: relation-store & follow projection per actorId, no leak
- Guest: no block/mute/close-friend/privacy entry points; following private -> `ForbiddenError` toast
- Self: no menu, no block (`CannotBlockYourselfRule`)

## 9. Testing (TDD, Vitest + RTL)

- `relation-graph.test.ts`: transitions (idempotent follow, unfollow from pending/accepted), accepted-only counts & indexes, close-friend requires accepted, dormant flag & reactivation, `acceptAllRequests` k edges + counts
- `block-graph.test.ts`: purge both directions incl. pending, keeps flags, self-block ignored
- `visibility.test.ts`: table test of D8 matrix incl. guest (`asViewer`), dormant close friend NOT visible, blocked-by direction
- Services: filter before pagination (full pages), `locked`, thread null, guest `ForbiddenError`, `respondFollowRequest` decisions
- `user-store.test.ts`: `setFollowStatus` counts on accepted boundary only, pending projection, I11 invariants kept
- `relation-store.test.ts`: optimistic + rollback, serial queue order, last op wins
- `post-store.test.ts`: exclusion reasons overlap, buffer/feed skip, replies blocked only
- Components: `FollowButton` 3 states, `PostCardMenu` mute undo & block confirm, lists (empty/error/paging), banner, locked profile variants, composer toggle, settings nav

## 10. Verification

- `npm run test`, `npm run typecheck`, `npx eslint src` - no new errors vs baseline (55 E / 17 W)
- Browser pane: login demo -> banner -> approve/decline; toggle public (dialog k); block from feed menu -> posts gone, profile shows blocked state, unblock; mute -> gone from feeds, profile still shows; `/@huyvo` locked + request; `/@namle.codes` Requested cancel; close-friends posts ring; composer toggle -> post visible to marked user only (switch via logic test)
- 375 / 768 / 1440, light & dark, keyboard focus on lists & dialogs

## 11. Tech Debt / BE Gaps (recorded)

- BE missing: accept/decline request endpoint, mute endpoint, privacy toggle endpoint, block list / mute list / requests queries, post visibility field in `CreatePostRequest`
- `PostAudience` (reply permission) still not enforced
- Server route can't know block state (D13) until real BE
- Per-viewer like/bookmark flags (existing debt) unchanged

## 12. Out of Scope

- Restrict (D1), "Not interested", reply/mention permissions (4.1), realtime request notifications (3.3), report flow (6.5), remaining settings routes (4.1)
