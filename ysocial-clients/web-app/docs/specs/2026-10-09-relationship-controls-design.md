# Relationship Controls - Design Spec

- **Date:** 2026-10-09
- **Status:** implemented 2026-10-09 (as-built: `.context/features/relationship-controls.md`; rev 3 + review fix pass: pending kept on follow graph load, viewer-scoped search caches, dormant close friend flags)
- **Roadmap:** `.context/roadmap.md` -> Phase 2 sub-project **2B**: 2.3 (private account & follow requests) + 2.4 (close friends) + 2.5 (block / mute). Restrict deferred (D1)
- **Scope rule:** FE ONLY, mock data. NO BE/API/DB calls. Mock services mirror BE domain shapes (`UserRelation`, `UserBlock`, `PrivacySettings`) so swapping to real API touches services only

## 1. Goal

- Viewer can make account private, approve/decline follow requests; follow to private account becomes `pending`
- Viewer can block / mute users from `PostCard` menu & profile; content actually hidden (not toast only)
- Viewer can mark close friends; author can publish close-friends-only posts, shown with green ring + label
- Manager lists (requests, blocked, muted, close friends) = reusable components mounted in minimal `/settings` shell (4.1 extends it)
- Feeds, search, tags, thread, saved & profile respect 1 visibility contract, enforced by mock services before pagination

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Restrict | Deferred: BE has no concept. Roadmap 2.5 notes "Restrict deferred" |
| D2 | Manager mount | Minimal `/settings` shell now: `privacy`, `blocked`, `muted`, `close-friends`. Sidebar dropdown gets "Settings" item. 4.1 adds remaining routes |
| D3 | Follow requests entry | `FollowRequestsBanner` at top of `/notifications`, links to `/settings/privacy#requests`. Hidden when count = 0 |
| D4 | Enforcement layer | Hybrid: mock services filter (source of truth, before pagination, mirrors feed spec D9); stores hide instantly after mute/block. Replaces roadmap wording "content filtering in `post-store` selectors" (client-only filter gives short pages & leaks private posts) |
| D5 | Follow command semantics | 2 explicit commands mirroring BE `POST/DELETE /relations/follow`: `followUser(targetId)` (idempotent: none -> pending/accepted; pending/accepted unchanged) & `unfollowUser(targetId)` (pending/accepted -> none; none unchanged). Click on "Requested" = `unfollowUser` (cancel). Store sets explicit target status, NEVER toggles. Optimistic status: `unfollow` = `none`; `follow` = `pending` IF target `isPrivate` ELSE `accepted`. Reconciled with service result. Block cleanup sets explicit `none` |
| D6 | Close-friend direction | Edge `observer -> target` with `isCloseFriend` = observer marked target. Client projection `viewerMarkedCloseFriend` (viewer -> target). Post visibility uses `isMarkedBy(authorId, viewerId)` (author -> viewer) inside `visibility.ts` ONLY; no client projection for that direction (viewer seeing post already implies it; badge comes from `post.visibility`) |
| D7 | Close-friend activation | Effective ONLY when edge status = `accepted` AND `isCloseFriend`. Unfollow / block keep `isCloseFriend` **dormant** (BE soft-delete parity); re-follow reactivates. Dormant flag NEVER grants post visibility & never appears in close-friend list |
| D8 | Visibility rules split | `canDiscoverUser`, `canViewProfile`, `canViewPost` in `src/mocks/visibility.ts`. Private accounts stay discoverable (search, suggestions, lists) so users can request follow |
| D9 | Guest policy | Services keep `actorId` param (profile spec D9), normalized by `asViewer(actorId): string \| null` (`GUEST_ACTOR_ID` = `null`) before `can*` calls. Guest sees public non-close-friends content only. **Every** guest relationship mutation (follow incl. public targets, unfollow, block, mute, close friend, privacy, respond request) -> `ForbiddenError`. UI: `FollowButton` stays visible for guest, click navigates to `/login`; block / mute / close-friend menu items & settings lists hidden. Guest like/post gating stays tech debt (profile spec §11) |
| D10 | Post visibility field | NEW `PostItem.visibility?: "public" \| "closeFriends"` (absent = `public`). Existing `PostAudience` = reply permission ("Anyone can reply"), NOT visibility; untouched & still not enforced. Composer gets separate close-friends toggle (D23). BE gap: `CreatePostRequest` has no visibility field (§11) |
| D11 | Mute semantics | Mute hides author from home feeds (`forYou`, `following`) & new-post stream/pill ONLY. Profile, thread, search, tags still show. Muting followed user keeps follow (counts unchanged) |
| D12 | Block semantics | Bidirectional hide everywhere (`canDiscoverUser` false, `canViewPost` false both directions). Block purges follows & pending requests BOTH directions (explicit `none`), keeps `isCloseFriend` dormant (D7), keeps mute flag. Unblock does NOT restore follows. Self-block: service throws `CannotBlockYourselfError`; graph keeps defensive no-op guard |
| D13 | Blocked profile route | `resolveProfileRoute` (server) cannot see client mock graph, so NO 404 for block. Profile renders state: viewer blocked target = "You blocked @x" + Unblock; target blocked viewer = "Profile unavailable" |
| D14 | Private profile view | Private & viewer not accepted & not owner: header + counts visible, tabs replaced by locked `EmptyState`, followers dialog not openable |
| D15 | Private -> public | Auto-accepts every pending request. O(k) for k requests; each edge update through single write point (D17), indexes stay consistent. Confirm dialog shows k. Client refetches request count + own user after success |
| D16 | Code placement | Relation service & store live in `features/profile` (`services/relation-service.ts`, `store/relation-store.ts`): separate `relations` feature would create `relations <-> profile` cycle (needs `user-store`). Settings UI = new `features/settings` (imports `@/features/profile` barrel). `notifications` imports `profile` barrel (banner). No new cycle |
| D17 | Mock authority | `src/mocks/relation-graph.ts` = sole relation truth (replaces `follow-graph.ts`); `block-graph.ts`, `privacy.ts` beside it. Every edge mutation through 1 internal `writeEdge` keeping 3 indexes in sync. Zustand stores = viewer-scoped optimistic projection ONLY |
| D18 | Mutation ordering contract | Mock graph writes synchronous & atomic (applied in call, before `mockDelay`), incl. bidirectional block & bulk accept, so graph order = call order. NO per-pair queue (YAGNI). Client guards: (a) **per-target op version** `opVersion[actorId][key]` (key = target id; `"self"` for privacy; requester id for respond); follow / block / mute / close friend on same target conflict, different targets never interfere; block bumps target key, covering both directions of that pair; reconcile (refetch / apply service result) ONLY IF key version unchanged since op start. (b) **Field-scoped rollback** on failure: revert a field ONLY IF it still holds this op's optimistic value, independent of versions. (c) **Stale-read guard:** `mutationSeq[actorId]` bumped by every op; `ensureRelationSets` records it at request start & discards result if changed & reads again until a response lands (no attempt cap; only a new mutation or a newer load ends it, so the slot always ends `loaded`). (d) **Viewer generation** (D25). Real-API ordering = §11 debt |
| D19 | Request response API | `respondFollowRequest(requesterId, decision: "accept" \| "decline", actorId)`. Decline = requester edge set to `none` (no notification) |
| D20 | Author exclusion in `post-store` | `excludedAuthors: Record<authorId, { muted?: true; blocked?: true }>`; `blocked` covers BOTH directions (viewer blocked author OR author blocked viewer, from `RelationSets.blocked` + `blockedBy`), so `PostCard` guard, stream buffer & pill share 1 source. `excludeAuthor(id, reason)` / `includeAuthor(id, reason)` touch ONLY given reason; entry deleted when empty. Feeds & incoming skip any excluded author; replies skip `blocked` only. Unblock/unmute never restores removed ids; next page-1 load brings them back |
| D21 | Seed | §4.2. Demo `1` private with 4 pending requests (accepted trade-off: guest cannot see demo tabs) |
| D22 | Settings layout | Route group `app/settings/(sections)/layout.tsx` renders `MainLayout aside={<SettingsNav/>}` (new optional prop; `lg+` replaces `RightSidebar`, center column keeps 600px) for 4 child routes. `/settings` index keeps default `RightSidebar` & renders nav list in center column -> menu never shown twice. Below `lg` child routes show Back header |
| D23 | Close-friends badge | Avatar `ring-2 ring-emerald-500` + small "Close friends" label (Lucide `Star`). Emerald = semantic exception to "1 accent" rule (recorded in FE conventions on closure) |
| D24 | Request count sync | `fetchRelationSets` returns `requestCount` & `blockedBy` (single load path via `ensureRelationSets`). After `respondFollowRequest`, block of user with pending request either way, or `setPrivate`: refetch count; open `FollowRequestList` reloads page 1 |
| D25 | Viewer switch | `viewerGeneration` bumped on every actor change. `ViewerSync` on change: (1) reset viewer-dependent feed state (`feedIds`, `feedMeta`, `incoming`, `consumedIncoming`, `droppedAuthorIds`, `excludedAuthors`); (2) `invalidateViewerProjection(actorId)` clears new viewer's `user-store` follow projection (`status`, `known`, `loaded`) & `relation-store` slot, because while another account was active, mutations (respond, bulk accept, block cleanup) may have changed this viewer's edges; (3) `ensureRelationSets(actorId, { force: true })`. Result applied to `post-store` ONLY IF generation unchanged since request start (covers A -> B -> A) & D18 (c). Mock = 1 session, so only an account switch changes another viewer's edges: invalidate-on-switch covers every cross-viewer case without per-pair tracking |
| D27 | Follow-list access | `fetchFollowList` returns empty page unless `canDiscoverUser` AND `canViewProfile`. Block NOT folded into `canViewProfile`: `fetchUser` must still return blocked users so profile shows blocked state (D13) |
| D26 | Lists after block | Feeds & stream: store exclusion (D20). Blocked user's profile & open thread detail: refetch (blocked state / not-found). Search, tag, saved & profile tab lists: hidden by `PostCard` null guard on blocked author (fallback), NO refill; short page until next mount. Reason: refetching every mounted list needs invalidation bus & resets scroll/paging |

## 3. Global Constraints

- Same stack/rules as profile-core spec §3: Next.js 16, React 19, TS strict, Tailwind v4, Zustand 5, shadcn/Radix, Lucide ONLY, no new deps
- Cross-feature imports via barrels, used at render/call time only (feed spec I9)
- Touch targets >= 44px, icon buttons `aria-label`, `motion-reduce`, no `hover:scale-*`
- Store updates touching >1 entity in 1 `set()`
- i18n keys flat `domain.elementName`, vi + en
- Private routes `robots: { index: false }`

## 4. Architecture & Data Flow

```
UI (FollowButton / PostCardMenu / ProfileHeaderMenu / Settings lists / Banner)
  -> profile/store helpers: commitFollow(next) | commitBlock | commitMute | commitCloseFriend | commitPrivacy | respondRequest
       optimistic: user-store.setFollowStatus / relation-store / post-store.excludeAuthor   (1 set() per store)
       relation-store: opVersion[actorId][key] += 1, mutationSeq[actorId] += 1
  -> profile/services: user-service.followUser|unfollowUser, relation-service.*   (ForbiddenError for guest)
  -> src/mocks: relation-graph.writeEdge | block-graph | privacy   (sync atomic write, then mockDelay)
  -> reconcile IF opVersion[key] unchanged: refreshUsers / refetch request count / reload open list
  -> failure: field-scoped rollback (field still holds optimistic value)

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
- Unknown observer lazily materialized with `SEED_FOLLOWED_AUTHOR_IDS` (accepted edges), as today
- `block-graph.ts`: `Map<blocker, Set<blocked>>`; `setBlocked(blocker, blocked, on)`: on -> `removeFollow` both directions (incl. pending), flags untouched; self = defensive no-op. `isBlocked(a, b)`, `isEitherBlocked(a, b)`, `getBlockedIds`, `__reset`
- `privacy.ts`: `Map<userId, boolean>`; `isPrivate`, `setPrivate(id, value)` (false -> `acceptAllRequests`), `__reset`
- `visibility.ts`:
  - `asViewer(actorId)` = `null` for `GUEST_ACTOR_ID`
  - `canDiscoverUser(viewer, userId)` = !(viewer & isEitherBlocked(viewer, userId))
  - `canViewProfile(viewer, userId)` = viewer === userId OR !isPrivate(userId) OR status(viewer -> userId) = accepted
  - `isMarkedBy(authorId, viewer)` = edge(author -> viewer).status = accepted & isCloseFriend
  - `canViewPost(viewer, post)` = canDiscoverUser(viewer, author) & canViewProfile(viewer, author) & (post.visibility != closeFriends OR viewer === author OR isMarkedBy(author, viewer))
  - `isMutedBy(viewer, authorId)` for feed filters

### 4.2 Seed

| Seed | Purpose |
|---|---|
| `author-07` private, demo `1` none | Locked profile, Follow -> pending |
| `author-05` private, demo `1` pending | "Requested" button, cancel |
| Demo `1` private; pending from `author-02`, `author-08`, 2 fans | Banner + approval list |
| `author-03` (demo follows) follows demo accepted + marks demo close friend; 2 close-friends posts | Demo sees green ring |
| `author-02` 1 close-friends post, demo not marked | Demo does NOT see it |
| Demo marks `author-03` close friend; no blocks, no mutes | Lists non-empty |

- Close friend only on accepted edges (BE rule). `author-03 -> 1` accepted added to `SEED_FOLLOWING`
- Existing seed tests updated where counts change (accepted-only counting)

### 4.3 `user-service` (profile)

- `UserProfile` adds `isPrivate` (base, shared) + viewer projection `followStatus`, `viewerMarkedCloseFriend`, `isMuted`, `isBlocked` (viewer blocked), `isBlockedBy`. `isFollowing` kept = `followStatus === "accepted"`
- `setFollow` replaced by `followUser(id, actorId): Promise<FollowStatus>` & `unfollowUser(id, actorId): Promise<void>`, delegating to graph (D17). Guest -> `ForbiddenError` (D9); blocked either way -> `ForbiddenError`
- `searchUsers`, `fetchSuggestedUsers`, `fetchFollowList` filter listed users by `canDiscoverUser`. `fetchFollowList` of profile failing `canDiscoverUser` OR `canViewProfile` -> empty page (D27)
- `fetchFollowedIds` returns accepted only

### 4.4 `relation-service` (profile, new)

| Fn | Notes |
|---|---|
| `setBlocked(id, on, actorId)` | D12; self -> `CannotBlockYourselfError` |
| `setMuted(id, on, actorId)` | creates `none` edge when absent |
| `setCloseFriend(id, on, actorId)` | throws unless accepted (BE rule) |
| `setPrivate(on, actorId)` | D15; returns `{ acceptedCount }` |
| `fetchFollowRequests({ query, page }, actorId)` | requesters as `UserProfile[]`, newest-first by insertion, page 20 |
| `fetchFollowRequestCount(actorId)` | refetch after D24 mutations |
| `respondFollowRequest(requesterId, decision, actorId)` | D19 |
| `fetchBlockedUsers` / `fetchMutedUsers` / `fetchCloseFriendCandidates` | `{ query, page }`; candidates = accepted followees, `viewerMarkedCloseFriend` projected |
| `fetchRelationSets(actorId)` | `{ blocked, blockedBy, muted, closeFriends, isPrivate, requestCount }` |

- All writes: guest -> `ForbiddenError`; sync graph write, then `mockDelay()`

### 4.5 `post-service` (posts)

- `fetchUserPosts(userId, tab, page, actorId)` returns `{ ..., locked: boolean }` (`locked` = !canViewProfile; posts empty)
- `searchPosts(query, actorId, limit, sort)`, `fetchPostsByTag(tag, sort, actorId)`, `fetchSavedPosts` filter `canViewPost`
- `fetchPostThread(id, actorId)`: root !canViewPost -> `null` (not-found); replies filtered
- `fetchFeed` filters `canViewPost` & !`isMutedBy`
- `subscribeToNewPosts` is global (not viewer-scoped): generates ONLY `public` posts by public authors (privacy check at generation). Viewer mute/block applied by `post-store.bufferIncoming` skipping `excludedAuthors`
- `createPost`: `CreatePostInput.visibility` stored as `PostItem.visibility`. Replies carry no visibility; reply visible iff its thread root visible & reply author passes rules
- Filtering ALWAYS before `pageOf`/slice

### 4.6 Stores

- `user-store`:
  - `clearViewerFollows(actorId)` (used by `invalidateViewerProjection`)
  - `ViewerFollows.ids` replaced by `status: Record<id, "pending" | "accepted">`; `known`/`loaded`/`version` kept (feed spec I11)
  - `setFollowStatus(actorId, id, next: FollowStatus)` replaces `toggleFollow`: explicit, counts ±1 only when crossing `accepted` boundary
  - `useFollowState(id): FollowStatus | undefined`; `useFollowedIds` accepted only
  - `commitFollow(actorId, id, next: "follow" | "unfollow")`: optimistic per D5, then service status applied IF version unchanged, then `refreshUsers`
- `relation-store` (new):
  - `byViewer: Record<actorId, { blocked, blockedBy, muted, closeFriends: Record<id, true>; isPrivate?: boolean; requestCount?: number; loaded; opVersion: Record<key, number>; mutationSeq: number }>`; module-level `viewerGeneration`
  - Selectors `useIsBlocked`, `useIsMuted`, `useViewerMarkedCloseFriend`, `useIsPrivateAccount`, `useFollowRequestCount`
  - `ensureRelationSets(actorId, { force? })` deduped per actor; result discarded IF `mutationSeq` changed (D18 c); applied to `post-store` ONLY IF `viewerGeneration` unchanged (D25)
  - Commit helpers: optimistic, bump `opVersion[key]` + `mutationSeq` (D18), reconcile only IF key version unchanged, field-scoped rollback on failure
  - `invalidateViewerProjection(actorId)` (D25)
- `post-store`:
  - `excludedAuthors` (D20); actions `excludeAuthor`, `includeAuthor`, `setExcludedAuthors(map)`, `resetViewerFeeds()` (D25)
  - `bufferIncoming` & `setFeedPage` skip excluded; selector `useIsAuthorBlocked(id)`
- `commitBlock(actorId, id)` (1 call): relation-store blocked + user-store `setFollowStatus(none)` both directions in cache + post-store `excludeAuthor(blocked)`; reconcile `refreshUsers([id, actorId])` + request count (D24) IF `opVersion[id]` unchanged; failure -> field-scoped rollback in all 3 stores

## 5. Routes

```
app/settings/
├── layout.tsx                  # metadata robots noindex, guest gate
├── page.tsx                    # MainLayout (default RightSidebar) + SettingsIndex nav list
└── (sections)/
    ├── layout.tsx              # MainLayout aside={<SettingsNav/>} (D22)
    ├── privacy/page.tsx        # PrivacySettings + FollowRequestList (#requests)
    ├── blocked/page.tsx        # BlockedUserList
    ├── muted/page.tsx          # MutedUserList
    └── close-friends/page.tsx  # CloseFriendsList
```
- Pages thin, metadata in `page.tsx`. Guest -> `EmptyState` with login CTA

## 6. UI / Components

- `features/settings/components/`: `settings-nav.tsx`, `settings-index.tsx`, `settings-page-header.tsx` (Back below `lg`), `privacy-settings.tsx` (Switch + AlertDialog showing k when going public)
- `features/profile/components/` (reusable, exported via barrel):
  - `relation-user-list.tsx`: debounced search, "load more" paging, row action slot, `EmptyState`, error + retry, skeleton rows
  - `follow-request-list.tsx` (Confirm / Delete), `blocked-user-list.tsx`, `muted-user-list.tsx`, `close-friends-list.tsx` (per-row toggle + count)
  - `follow-requests-banner.tsx`: 3 stacked avatars + count
  - `profile-header-menu.tsx`: Block, Mute, Add/Remove close friends (accepted only)
  - `block-confirm-dialog.tsx`: shared by post menu & profile
  - `profile-locked-state.tsx`: variants private / blocked / unavailable
- `FollowButton`: states Follow / Requested / Following; `aria-pressed` for Following; Requested click cancels without confirm; blocked target -> Unblock; guest click -> `/login`
- `PostCardMenu` viewer: Mute/Unmute (toast + Undo), Block (confirm dialog). Hidden for guest & own posts
- `PostCard`: close-friends ring + label from `post.visibility`; null when author blocked (fallback, D26)
- Composer (`post-creator-core.tsx`): close-friends toggle chip (Lucide `Star`), hidden for guest & reply mode; `onPostSubmitted` passes visibility
- `ProfileHeader`: lock icon next to name when private; menu for non-own profiles
- Sidebar dropdown (`main-layout.tsx`): "Settings" item, links to `/settings`
- `/notifications`: banner above list

## 7. i18n

- Domains: `settings.*`, `relations.*` (block / mute / close friend / requests / locked), extended `card.*`, `profile.*`, `notifications.*`, `creator.*`. Full key list in plan

## 8. Edge Cases

- Block while pending request exists either way: requests removed, count refetched
- Block followed user who marked viewer close friend: flag dormant, posts hidden (D7)
- Unblock: follow stays `none`; posts return on next page-1 load
- Mute + block, then unblock: still muted (D20)
- Mute followed user: hidden from `following` tab, still counted as followed; pending-feed classification skips excluded authors
- Unfollow close friend: hidden from close-friend list; re-follow public target reactivates flag (regression test)
- Follow private: pending; owner accepts; viewer's next refresh shows Following + unlocked tabs
- Cancel request ("Requested" click) while follow in flight: version guard keeps last op
- Private -> public with k requests: all accepted, counts +k, banner hidden
- Thread root author blocked while detail open: detail refetches, shows not-found
- Account switch: feeds reset, stale `ensureRelationSets` response not applied to `post-store` (D25)
- `"2"` requests private `"1"`, switch to `"1"`, accept, switch back: `"2"` sees Following (projection invalidated on switch, D25)
- Block A fails while mute B in flight: A rolled back (field-scoped), B unaffected (D18)
- Author blocked viewer: cached posts hidden, later stream posts skipped (D20)
- Direct `fetchFollowList` of profile blocked either way: empty (D27)
- Guest: Follow -> `/login`; no block / mute / close-friend / privacy entry points; direct service call -> `ForbiddenError`
- Self: no menu; service rejects self-block

## 9. Testing (TDD, Vitest + RTL)

- `relation-graph.test.ts`: idempotent follow, unfollow from pending/accepted, accepted-only counts & indexes, close friend requires accepted, dormant flag & reactivation, `acceptAllRequests` k edges + counts
- `block-graph.test.ts`: purge both directions incl. pending, flags kept, self no-op
- `visibility.test.ts`: table test of D8 incl. guest (`asViewer`), dormant close friend NOT visible, blocked-by direction
- Services: filter before pagination (full pages), `locked`, thread `null`, guest `ForbiddenError` for every mutation, self-block error, `respondFollowRequest` decisions, `fetchRelationSets.requestCount` & `blockedBy`, `fetchFollowList` empty when blocked either way
- `user-store.test.ts`: `setFollowStatus` counts only on accepted boundary, unfollow optimistic = none, pending projection, I11 invariants
- `relation-store.test.ts`: optimistic + field-scoped rollback, failed block rolled back despite unrelated mute, same-target newer op skips stale reconcile, stale `ensureRelationSets` discarded after mutation & after A -> B -> A, projection invalidated on switch (request accepted by other account), `blockedBy` -> `excludedAuthors.blocked`
- `post-store.test.ts`: exclusion reasons overlap, buffer/feed skip, replies blocked only, `resetViewerFeeds`
- Components: `FollowButton` states + guest redirect, `PostCardMenu` mute undo & block confirm, lists (empty / error / paging), banner, locked profile variants, composer toggle, settings index vs section layout (nav once)

## 10. Verification

- `npm run test`, `npm run typecheck`, `npx eslint src`: no new errors vs baseline (55 E / 17 W)
- Browser pane: login demo -> banner -> approve/decline; go public (dialog k); block from feed menu -> posts gone, profile blocked state, unblock; mute -> gone from feeds, profile still shows; `/@huyvo` locked + request; `/@namle.codes` Requested cancel; close-friends ring; composer toggle
- 375 / 768 / 1440, light & dark, keyboard focus on lists & dialogs

## 11. Tech Debt / BE Gaps

- BE missing: accept/decline request, mute, privacy toggle endpoints; block / mute / requests list queries; post visibility field in `CreatePostRequest`
- Real-API write ordering: overlapping requests may land out of order; needs per-viewer serialization or server versioning when wired (D18)
- `PostAudience` (reply permission) still not enforced
- Server route cannot see block state (D13) until real BE
- Search / tag / saved lists not refilled after block (D26)
- Guest like/post gating, per-viewer like/bookmark flags (existing debt)

## 12. Out of Scope

- Restrict (D1), "Not interested", reply/mention permissions (4.1), realtime request notifications (3.3), report flow (6.5), remaining settings routes (4.1)
