---
module: Relationship Controls (FE, mock data) - roadmap 2.3 + 2.4 + 2.5 (Phase 2B)
updated: 2026-10-14
spec: ysocial-clients/web-app/docs/specs/2026-10-09-relationship-controls-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-09-relationship-controls.md
---

# Relationship Controls

Private account & follow requests, close friends, block / mute on mocks. Restrict deferred (BE has no concept). NEVER calls BE

## Data flow
```
UI (FollowButton / PostCardMenu / ProfileHeaderMenu / settings lists / banner)
  -> profile/store/relation-store: commitBlock | commitMute | commitCloseFriend | commitPrivacy | commitRespondRequest
     user-store.commitFollow(actor, id, "follow" | "unfollow")
       beginOp(actor, key) -> optimistic (user-store / relation-state / post-store) -> service -> reconcile IF op still current
       failure -> field-scoped rollback (field reverts only while it still holds this op's optimistic value)
  -> profile/services: user-service.followUser|unfollowUser, relation-service.*  (guest -> ForbiddenError)
  -> src/mocks: relation-graph (writeEdge) | block-graph | privacy   (sync write before mockDelay)
Reads: post-service / user-service -> mocks/visibility.ts (asViewer) -> filter -> paginate
```

## Key rules
- **Mock authority:** `relation-graph.ts` (edge observer->target `{status none|pending|accepted, isCloseFriend, isMuted}` + followers/requests indexes, `writeEdge` only mutation), `block-graph.ts`, `privacy.ts`. Zustand stores are viewer-scoped projections ONLY
- **Visibility** (`mocks/visibility.ts`): `canDiscoverUser` (block either way), `canViewProfile` (private & not accepted & not owner = false; block NOT folded in), `canViewPost` (+ close friends needs ACCEPTED edge author->viewer with flag). Dormant flag (after unfollow / block) never grants visibility. Services filter BEFORE pagination
- **Guest:** `asViewer("me") = null`; every relationship mutation `ForbiddenError`; UI hides block / mute / close friend / settings; FollowButton click -> `/login`
- **Follow commands:** `followUser` (none -> pending if target private else accepted, idempotent), `unfollowUser` (also cancels pending). Optimistic status explicit, NEVER toggled. `unfollowUser` is not rejected under block (no-op)
- **Ordering:** `store/op-ledger.ts` (plain module): per-target op version, per-actor mutation seq, viewer generation. Same target ops conflict (follow vs block), different targets never interfere
- **Relation state split:** `relation-state.ts` (pure zustand slice, no store imports, read by `user-store` to compose `isBlocked`/`isBlockedBy`/`isMuted`/`viewerMarkedCloseFriend` into `useUser`) + `relation-store.ts` (load, commits, selectors, `invalidateViewerProjection`). Avoids user-store <-> relation-store cycle
- **Follow status projection:** `ViewerFollows.status` (`pending|accepted`, absent = none). `fetchFollowedIds` is accepted-ONLY, so `setFollowedIds` keeps cached pending entries and `followState` trusts "none" only for ids in `known` (loaded graph alone proves nothing about pending)
- **Close friend set:** `fetchRelationSets.closeFriends` = every flag (dormant included); effective = flag AND accepted (`useCloseFriendCount`, `useViewerMarkedCloseFriend`, `withViewerDefaults`)
- **Exclusion** (`post-store.excludedAuthors`): `muted` | `blocked` (blocked = either direction). Feeds + buffer + pill skip any; replies skip blocked only; `includeAuthor` lifts ONLY given reason; unblock keeps `blocked` when author also blocked viewer; removed ids never restored. `PostCard` renders null for blocked author (fallback for search / tag / saved / profile lists, not refilled)
- **Viewer switch** (`ViewerSync`): bump generation, `resetViewerFeeds`, `invalidateViewerProjection` (clear follow projection + relation slot), `ensureFollowGraph`, `ensureRelationSets(force)`. Stale loads (token / generation / mutation seq) never apply: `loadRelationSets` rereads until a response starts after the last mutation (ends only by newer load), so the slot always ends `loaded`. PostFeed first load keyed by viewer
- **Profile states:** precedence blocked-by (unavailable) > blocked (Unblock) > locked private > tabs. Non-own signed-in viewers wait for relation sets (skeleton, no flash of tabs). Counts visible but not clickable when locked
- **Follow state gate:** `ProfileLookup` renders cached non-own user ONLY while `useFollowState(user.id)` is known (account switch clears it, `useUserByUsername` would read "none" = locked flash); unknown -> skeleton until the lookup refetch, refetch failure -> desync state
- **Request list reload:** `requestsVersion` bumped by external count changes (going public, blocking requester), never by list's own responses
- **Settings:** `/settings` index (center column list, default right sidebar) and `(sections)/` layout with `MainLayout aside={<SettingsNav/>}` (lg+). Root layout = noindex + `SettingsGuestGate` (own shell for guests). Pages thin, containers in `features/settings`
- **Caches are viewer-scoped:** search result carries `actorId`; `tagPageKey(tag, sort, actorId)`
- **Trending / tag lists** count only root posts signed-out visitor can see (`collectTagStats` skips replies; `getMockTagStat` for tag OG filters seeds by `canViewPost(null, post)`)
- **Metadata:** `/posts/[id]` `generateMetadata` returns generic title for close friends, private author or reply under such root (`isPostPubliclyVisible`)
- **Composer:** close friends chip (signed-in, post mode); `visibility` only sent when `closeFriends`; drafts keep `visibility`; submit, save-and-close & discard reset it to `public`. Badge = `ring-emerald-500` + label

## Files
- `src/mocks/`: `relation-graph.ts`, `block-graph.ts`, `privacy.ts`, `visibility.ts`, `seed-authors.ts` (`SEED_CLOSE_FRIENDS`), seed pending in `relation-graph.ts`
- `profile/services/`: `user-service.ts` (`projectUser`, `followUser`, `unfollowUser`), `relation-service.ts`
- `profile/store/`: `user-store.ts`, `relation-state.ts`, `relation-store.ts`, `op-ledger.ts`; `utils/user-projection.ts`; `mocks/user-fixtures.ts` (test fixture)
- `profile/components/`: `follow-button` (Follow / Requested / Following / Unblock), `block-confirm-dialog`, `profile-header-menu`, `profile-locked-state`, `relation-user-list`, `follow-request-list`, `blocked-user-list`, `muted-user-list`, `close-friends-list`, `follow-requests-banner`, `viewer-sync`
- `settings/`: `components/{settings-nav,settings-index,settings-page-header,settings-guest-gate,privacy-settings,settings-sections}`, `constants.ts`; `components/ui/switch.tsx`
- `posts/`: `post-service` (filters, `isPostPubliclyVisible`, `locked`), `post-store` (exclusion), `post-card` (badge, blocked guard), `post-card-menu`, `post-creator-core` (chip)
- Seed: demo `1` private with 4 pending (`author-02`, `author-08`, 2 fans), `author-05` private (demo pending), `author-07` private, `author-03` marks demo close friend + 2 CF posts, `author-02` 1 CF post (not marked)

## Pitfall log
1. **Conditional hook via `||`**
   - **Symptom:** "Rendered fewer hooks than expected" once the first hook returned true
   - **Root Cause:** `useIsBlocked(x) || useIsBlockedBy(x)` skips the 2nd hook
   - **Fix & Decision:** call hooks first, combine after (also `useViewerMarkedCloseFriend`). Rule: never put hook call on the right of `||` / `&&`
   - **Verification:** `post-detail-container.test.tsx` blocked author, `relation-store.test.ts` selectors
2. **Pending lost after graph load**
   - **Symptom:** "Requested" turned into "Follow" after switch / login
   - **Root Cause:** accepted-only follow set marked `loaded`, so every absent id read as none
   - **Fix & Decision:** keep pending in `setFollowedIds`; unknown unless `known` (see Key rules)
   - **Verification:** `user-store.test.ts` "follow state after the follow graph loaded"
3. **Viewer caches outside stores:** search result & tag pages were keyed by query only; now carry `actorId`
4. **Account switch flashes locked profile**
   - **Symptom:** followed private profile showed the locked state after switching account, until user reloaded
   - **Root Cause:** `invalidateViewerProjection` clears `status` & `known`, `useUserByUsername` defaults a missing status to "none", so `ProfileView` computed `locked` from cached base user
   - **Fix & Decision:** gate on `useFollowState` known in `ProfileLookup` (see Key rules); global default of selectors stays
   - **Verification:** `profile-container.test.tsx` switch tests (skeleton, never locked heading, desync on refetch failure)
5. **Dialog exit animation in hidden preview pane** never finishes (`data-state="closed"` but still in DOM). Not bug

## Tech debt
- **BE gaps:** accept/decline request, mute, privacy toggle, block / mute / request lists, post visibility in `CreatePostRequest`; real-API write ordering (spec D18)
- **Deferred minors:**
  - **M6:** `RelationUserList` offset paging skips rows after removals. Impact: low (needs remove then Load more). Fix needs cursor / after-id paging contract (lists have no BE yet). Priority: low. Next: pick cursor shape when BE list endpoints are designed
  - **Plural:** "1 close friends" (also `1 followers`...): `useTranslation` has no plural support, vi has none. Priority: low. Next: i18n-wide plural design (`Intl.PluralRules`), NOT a per-key patch
  - **Closed:** M2 (not reproducible, `collectTagStats` already skips replies; regression test added)
  - **Sibling gap:** composer close handlers still keep `audience` & `activeDraftId` (not visibility-related, untouched)
- `PostAudience` (reply permission) still unenforced; server route cannot see block state (D13); `/saved` reads seed directly
