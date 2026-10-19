---
module: Relationship Controls (FE; real BE by default, mock adapters in mock mode) - roadmap 2.3 + 2.4 + 2.5 (Phase 2B)
updated: 2026-10-19
spec: ysocial-clients/web-app/docs/specs/2026-10-09-relationship-controls-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-09-relationship-controls.md
---

# Relationship Controls

Private account & follow requests, close friends, block / mute. Restrict deferred (BE has no concept). Services dispatch per function to `relation-service.real.ts` / `user-service.real.ts` via `isRealApi(slice)` (follow & read = `content`, block / close friend / privacy / requests / follow lists = `graph`, mute = `activity`); env unset = all real, `none` = mock mode (`src/mocks/*` graphs). Where 2 differ, text below says "mock mode" or "real". As-built: `backend/integration/fe-be-integration.md` (Phases C, G, N)

## Data flow
```
UI (FollowButton / PostCardMenu / ProfileHeaderMenu / settings lists / banner)
  -> profile/store/relation-store: commitBlock | commitMute | commitCloseFriend | commitPrivacy | commitRespondRequest
     user-store.commitFollow(actor, id, "follow" | "unfollow")
       beginOp(actor, key) -> optimistic (user-store / relation-state / post-store) -> service -> reconcile IF op still current
       failure -> field-scoped rollback (field reverts only while it still holds this op's optimistic value)
  -> profile/services: user-service.followUser|unfollowUser, relation-service.*  (dispatch by slice; mock guest -> ForbiddenError)
     real : *.real.ts -> apiClient (BE enforces visibility / blocks, D14 / D15)
     mock : src/mocks: relation-graph (writeEdge) | block-graph | privacy   (sync write before mockDelay)
Reads: post-service / user-service -> real BE | mock: mocks/visibility.ts (asViewer) -> filter -> paginate
```

## Key rules
- **Authority (mock mode):** `relation-graph.ts` (edge observer->target `{status none|pending|accepted, isCloseFriend, isMuted}` + followers/requests indexes, `writeEdge` only mutation), `block-graph.ts`, `privacy.ts`. Zustand stores are viewer-scoped projections ONLY
- **Visibility (mock mode, mirrors BE)** (`mocks/visibility.ts`): `canDiscoverUser` (block either way), `canViewProfile` (private & not accepted & not owner = false; block NOT folded in), `canViewPost` (+ close friends needs ACCEPTED edge author->viewer with flag). Dormant flag (after unfollow / block) never grants visibility. Services filter BEFORE pagination
- **Capability gating** (`lib/capabilities.ts`, read per call): UI is hidden when its backing slice is not real. `blockUi` / `closeFriendsUi` / `privacyUi` / `followRequestsUi` / `followLists` are off only while content is real & graph is mock; `muteUi` is off while content is real & activity is mock; with all slices real (default) or `none` they are on. Facade (content real, graph or activity mock): `relation-service` reads answer empty, writes refused (real ids must not enter mock graph)
- **Real adapter:** `relation-service.real.ts`: reads `fetchFollowList`, `fetchFollowRequests` / `Count`, `fetchBlockedUsers` (`me/blocks`, items `isBlocked`), `fetchMutedUsers` (`me/mutes`), `fetchRelationSets` (`blockedBy` always `[]`: blocker is invisible, D14), `fetchCloseFriendCandidates` (`following` page + relation-set flags, pending dropped); writes `setBlocked`, `setCloseFriend` (BE 400 unless follow accepted), `setPrivateAccount` (-> `{acceptedCount}`), `respondFollowRequest`, `setMuted`. Ids pass `requireBackendId`; BE 404 is not mapped, it rejects so callers choose state (every commit already rolls back on rejection)
- **Guest (mock mode):** `asViewer("me") = null`; every relationship mutation `ForbiddenError`; UI hides block / mute / close friend / settings; FollowButton click -> `/login`
- **Follow commands:** `followUser` (none -> pending if target private else accepted, idempotent), `unfollowUser` (also cancels pending). Optimistic status explicit, NEVER toggled. `unfollowUser` is not rejected under block (no-op, mock mode; real BE: follow under block = 404)
- **Ordering:** `store/op-ledger.ts` (plain module): per-target op version, per-actor mutation seq, viewer generation. Same target ops conflict (follow vs block), different targets never interfere
- **Relation state split:** `relation-state.ts` (pure zustand slice, no store imports, read by `user-store` to compose `isBlocked`/`isBlockedBy`/`isMuted`/`viewerMarkedCloseFriend` into `useUser`) + `relation-store.ts` (load, commits, selectors, `invalidateViewerProjection`). Avoids user-store <-> relation-store cycle
- **Follow status projection:** `ViewerFollows.status` (`pending|accepted`, absent = none). `fetchFollowedIds` is accepted-ONLY, so `setFollowedIds` keeps cached pending entries & `followState` trusts "none" only for ids in `known` (loaded graph alone proves nothing about pending)
- **Close friend set:** `fetchRelationSets.closeFriends` = every flag (dormant included); effective = flag & accepted (`useCloseFriendCount`, `useViewerMarkedCloseFriend`, `withViewerDefaults`)
- **Exclusion** (`post-store.excludedAuthors`): `muted` | `blocked` (blocked = either direction). Feeds + buffer + pill skip any; replies skip blocked only; `includeAuthor` lifts ONLY given reason; unblock keeps `blocked` when author also blocked viewer; removed ids never restored. `PostCard` renders null for blocked author (fallback for search / tag / saved / profile lists, not refilled)
- **Viewer switch** (`ViewerSync`): bump generation, `resetViewerFeeds`, `invalidateViewerProjection` (clear follow projection + relation slot), `ensureFollowGraph`, `ensureRelationSets(force)`. Stale loads (token / generation / mutation seq) never apply: `loadRelationSets` rereads until response starts after last mutation (ends only by newer load), so slot always ends `loaded`. PostFeed first load keyed by viewer
- **Profile states:** precedence blocked-by (unavailable) > blocked (Unblock) > locked private > tabs. `blocked-by` exists in mock mode only: real `toUserProfile` forces `isBlockedBy: false` & blocked-either-way profile is BE 404 -> `profile.blockedNotFound` (anonymous server read cannot know it, so `ProfileContainer` decides). Non-own signed-in viewers wait for relation sets (skeleton, no flash of tabs). Counts visible but not clickable when locked
- **Follow state gate:** `ProfileLookup` renders cached non-own user ONLY while `useFollowState(user.id)` is known (account switch clears it, `useUserByUsername` would read "none" = locked flash); unknown -> skeleton until lookup refetch, refetch failure -> desync state
- **Request list reload:** `requestsVersion` bumped by external count changes (going public, blocking requester), never by list's own responses
- **Settings:** `/settings` index (center column list, default right sidebar) & `(sections)/` layout with `MainLayout aside={<SettingsNav/>}` (lg+). Root layout = noindex + `SettingsGuestGate` (own shell for guests). Pages thin, containers in `features/settings`
- **Caches are viewer-scoped:** search result carries `actorId`; `tagPageKey(tag, sort, actorId)`
- **Trending / tag lists** count only root posts signed-out visitor can see (`collectTagStats` skips replies; `getMockTagStat` for tag OG filters seeds by `canViewPost(null, post)`)
- **Metadata:** `/posts/[id]` `generateMetadata`: mock mode returns generic title for close friends, private author or reply under such root (`isPostPubliclyVisible`); real reads `threads/{id}` anonymously, BE 404 / outage -> generic title (page body still renders its own state)
- **Composer:** close friends chip (signed-in, post mode; hidden with audience picker while content is real, `postAudience` capability); `visibility` only sent when `closeFriends`; drafts keep `visibility` (real mode resets draft audience / visibility to default); submit, save-and-close & discard reset it to `public`. Real `createPost` sends only content + `imageUrl`, never `visibility` (BE `CreatePostRequest` has none). Badge = `ring-emerald-500` + label (`closeFriendsBadge` capability, off while content is real)

## Files
- `src/mocks/`: `relation-graph.ts`, `block-graph.ts`, `privacy.ts`, `visibility.ts`, `seed-authors.ts` (`SEED_CLOSE_FRIENDS`), seed pending in `relation-graph.ts`
- `profile/services/`: `user-service.ts` (`projectUser`, `followUser`, `unfollowUser`), `relation-service.ts` (dispatcher + mock adapter + facade), `relation-service.real.ts`, `user-service.real.ts`, `user-mapper.ts`; `lib/capabilities.ts`
- `profile/store/`: `user-store.ts`, `relation-state.ts`, `relation-store.ts`, `op-ledger.ts`; `utils/user-projection.ts`; `mocks/user-fixtures.ts` (test fixture)
- `profile/components/`: `follow-button` (Follow / Requested / Following / Unblock), `block-confirm-dialog`, `profile-header-menu`, `profile-locked-state`, `relation-user-list`, `follow-request-list`, `blocked-user-list`, `muted-user-list`, `close-friends-list`, `follow-requests-banner`, `viewer-sync`
- `settings/`: `components/{settings-nav,settings-index,settings-page-header,settings-guest-gate,privacy-settings,settings-sections}`, `constants.ts`; `components/ui/switch.tsx`
- `posts/`: `post-service` (filters, `isPostPubliclyVisible`, `locked`), `post-store` (exclusion), `post-card` (badge, blocked guard), `post-card-menu`, `post-creator-core` (chip)
- Seed (mock mode): demo `1` private with 4 pending (`author-02`, `author-08`, 2 fans), `author-05` private (demo pending), `author-07` private, `author-03` marks demo close friend + 2 CF posts, `author-02` 1 CF post (not marked)

## Pitfall log
1. **Conditional hook via `||`**
   - **Symptom:** "Rendered fewer hooks than expected" once first hook returned true
   - **Root Cause:** `useIsBlocked(x) || useIsBlockedBy(x)` skips 2nd hook
   - **Fix & Decision:** call hooks first, combine after (also `useViewerMarkedCloseFriend`). Rule: never put hook call on the right of `||` / `&&`
   - **Verification:** `post-detail-container.test.tsx` blocked author, `relation-store.test.ts` selectors
2. **Pending lost after graph load**
   - **Symptom:** "Requested" turned into "Follow" after switch / login
   - **Root Cause:** accepted-only follow set marked `loaded`, so every absent id read as none
   - **Fix & Decision:** keep pending in `setFollowedIds`; unknown unless `known` (see Key rules)
   - **Verification:** `user-store.test.ts` "follow state after follow graph loaded"
3. **Viewer caches outside stores:** search result & tag pages were keyed by query only; now carry `actorId`
4. **Account switch flashes locked profile**
   - **Symptom:** followed private profile showed locked state after switching account, until user reloaded
   - **Root Cause:** `invalidateViewerProjection` clears `status` & `known`, `useUserByUsername` defaults a missing status to "none", so `ProfileView` computed `locked` from cached base user
   - **Fix & Decision:** gate on `useFollowState` known in `ProfileLookup` (see Key rules); global default of selectors stays
   - **Verification:** `profile-container.test.tsx` switch tests (skeleton, never locked heading, desync on refetch failure)
5. **Dialog exit animation in hidden preview pane** never finishes (`data-state="closed"` but still in DOM). Not bug


## Tech debt
- **BE gaps:** post visibility in `CreatePostRequest` (no close friends posts from FE while content is real); real-API write ordering (spec D18) not re-verified here. Accept / decline, mute, privacy, block / mute / request / close-friend lists are real since Phases G / N
- **Deferred minors:**
  - **M6:** `RelationUserList` offset paging skips rows after removals. Impact: low (needs remove then Load more). BE lists are page-based (`page` / `pageSize`), so same skip applies; fix needs cursor / after-id paging contract on both sides. Priority: low. Next: pick cursor shape with BE
  - **Plural:** "1 close friends" (also `1 followers`...): `useTranslation` has no plural support, vi has none. Priority: low. Next: i18n-wide plural design (`Intl.PluralRules`), NOT per-key patch
  - **Closed:** M2 (not reproducible, `collectTagStats` already skips replies; regression test added)
  - **Sibling gap:** composer close handlers still keep `audience` & `activeDraftId` (not visibility-related, untouched)
- `PostAudience` (reply permission) still unenforced; server route cannot see block state (D13; real: handled client-side in `ProfileContainer`); `/saved` reads seed directly in mock mode (real: BE saved list)
