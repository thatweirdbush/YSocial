---
module: Profile Core (FE, mock data) - roadmap F0.6 + 2.1 + 2.2 + 2.6 (Phase 2A)
updated: 2026-10-09
spec: ysocial-clients/web-app/docs/specs/2026-10-07-profile-core-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-07-profile-core.md
---

# Profile Core

`/@username` on mocks: header, follow, edit (own), tabs Threads / Replies / Media / Saved(own), followers/following dialog, share (link + QR). NEVER calls BE (`features/profile` has 0 `apiClient`)

## Data flow
```
page.tsx (server) : params + cookies() -> parseMockSession -> resolveProfileRoute -> notFound() | <ProfileContainer key={username}>
Providers         : useLayoutEffect hydrate() -> <ViewerSync/> ensureViewerUser (once per session id, after hydrated)
ProfileContainer  : !hydrated -> ProfileSkeleton ; ProfileLookup (ensureViewerUser | ensureUserByUsername) -> ProfileView
ProfileView       : useProfileTabPostsController(user.id, actorId) -> ProfileTabPanel(tab) -> post-store (posts) / ProfileMediaGrid
FollowButton / FollowersDialog -> commitFollow(actor, id, follow|unfollow) -> setFollowStatus (optimistic) -> followUser|unfollowUser -> refreshUsers (only if no newer op on the target)
```

## Key rules
- **Identity:** `useViewerId(): string | null` = authenticated identity (own-profile, Saved, Edit, route). `useActorId()` = legacy mutation actor (`"me"` for guest) ONLY for mock services/stores. NEVER mix
- **Counts:** visible = `HIDDEN_*` baseline (`profile/mocks`) + graph relation count (`src/mocks/relation-graph.ts`, accepted edges only, `writeEdge()` only mutation; see `relationship-controls.md`). No stored counts. Dialog lists partial dataset by design
- **Fans:** `src/mocks/seed-fans.ts`, mulberry32(0x5eed), 30-60 per base user, follow only their base user, 0 followers. Excluded from suggestions, included in search & follow lists
- **Session cookie** `ysocial_mock_user` = `{ id, username }` ONLY. Client-writable, NOT auth boundary (never reuse as real auth). Lets server resolve current session's runtime user; another session's runtime user = 404.
- **Mock login** always signs in `SEED_DEMO_ACCOUNT` (`1`, `@ysocial_member`). Register issues id `2` for every new account
- **Tab state** lives in profile controller (context), keyed by `userId:actorId`; per-tab request tokens; scope change resets all tabs. `post-store` holds only posts + `usePinnedPostId`
- **PostCard** author = `useUser(post.user.id) ?? post.user` (profile edits show everywhere)
- **`commitFollow` reconciliation:** `refreshUsers(ids, actorId, shouldApply?)` re-checks `shouldApply()` right after fetch, before upsert - toggle landing while refetch is in flight is not overwritten by stale response. 2 version checks total: pre-fetch (skip refetch entirely) + post-fetch (skip upsert)
- **Edit dialog:** upserts `updateProfile`'s RETURNED projection (`upsertUsers`), never local form patch - service may normalize fields server-side
- **Composer:** profile emits `onCreatePost`; container -> `ui-store.openComposer()`; `MainLayout` owns dialog (no `PostCreatorDialog` import in profile)
- **Tech debt:** see spec §11 (profile<->posts cycle, guest gating, per-viewer bookmarks, shared mock store)

## Files
- `auth`: `utils/mock-session.ts`, `store/auth-store.ts` (`hydrated`, `hydrate()`, `useAuthHydrated`, `useViewerId`, `useActorId`, `getActorId`, `GUEST_ACTOR_ID`)
- `lib`: `i18n/translate.ts` (pure, server-safe), `errors.ts` (`ForbiddenError`), `store/ui-store.ts` (`composerOpen`)
- `profile/services/user-service.ts`: `fetchUserByUsername`, `fetchFollowList`, `updateProfile`, `upsertViewerUser`
- `profile/store/user-store.ts`: `idByUsername`, `patchUser`, `commitFollow`, `ensureUserByUsername`, `ensureViewerUser`, `refreshUsers`, `useUserByUsername`
- `profile/hooks/use-profile-tab-posts.tsx`, `utils/{order-with-pin,resolve-profile-route,share,viewer-user}.ts`
- `profile/components/`: container, header, tabs, tab-panel, reply-context, media-grid, edit dialog, followers dialog, share dialog, skeleton, viewer-sync
- `posts/services/post-service.ts`: `fetchUserPosts(userId, tab, page)`, `fetchSavedPosts(actorId, page)`, `ParentReference`
- `app/[@username]/`: `page.tsx`, `not-found.tsx`, `error.tsx` (NO `loading.tsx`, see pitfall 1)

## Pitfall log
1. **loading.tsx vs 404**
   - **Symptom:** unknown `/@x` showed not-found UI with HTTP 200
   - **Root Cause:** `loading.tsx` makes Next stream shell first, so `notFound()` cannot change status
   - **Fix & Decision:** no `loading.tsx` on this route (page awaits only params + cookies). Client hydration gating keeps `ProfileSkeleton`
   - **Verification:** `curl -w %{http_code}` 200 -> 404 after removal; `page.test.tsx`
2. **Register reuses id `2`**
   - **Symptom:** register `alice`, logout, register `bob` -> own profile skeleton forever
   - **Root Cause:** `ensureViewerUser` promise cached by id only; `upsertViewerUser` skipped existing id
   - **Fix & Decision:** key by `id:username`; upsert replaces runtime row when username differs; register schema restricts usernames to session-cookie shape & rejects seed usernames
   - **Verification:** user-store, user-service, `register-schema.test.ts`
3. **IntersectionObserver in preview pane** only fires when frame is produced (screenshot); infinite scroll looked broken during manual QA but was fine. Not bug
4. **Hooks order for scope reset:** child passive effects run before parent effects, so scope bookkeeping (`latest` ref, tokens) uses `useLayoutEffect`; derived `IDLE_TABS` when `scopeKey` mismatches
5. **StrictMode double fetch (`use-profile-tab-posts.tsx`)**
   - **Symptom:** `fetchUserPosts`/`fetchSavedPosts` called twice for same tab on first activation, dev only
   - **Root Cause:** `activate()` gated purely on `latest.current.state[tab].status === "idle"`. React StrictMode runs mount -> cleanup -> mount before `start` dispatch's re-render commits, so both invocations saw `idle` & both kicked fetch
   - **Fix & Decision:** added `activatedScope` ref (per tab, holds `scopeKey` fetch was already started for), set synchronously in `activate()` before async call. Guard is reset to `undefined` per tab in SAME layout-effect branch that bumps `tokens` on scope change (comparing `scopeKey` alone is not enough: scope revisited A -> B -> A keeps OLD guard value, which equals new key again & tab never refetch). `followers-dialog.tsx`'s first-page effect has same StrictMode class of issue (hidden by its request-token guard, so only wasted request, not correctness bug) - deferred, not fixed
   - **Verification:** `use-profile-tab-posts.test.tsx`: `<StrictMode>` harness asserts 1 call; separate test revisits scope `1:1 -> 1:2 -> 1:1` & asserts tab refetches

## Verification (2026-10-09)
- `npm run test`: 56 files / 527 tests pass (+6 vs 2026-10-08); `tsc` exit 0; eslint 55 E / 17 W (baseline 62 / 25), no file/rule increase
- Followers dialog error state & inline retry row are new UI, verified by tests only (mock-forced failures)
- Browser pane (2026-10-08, still valid): register -> own profile -> reload OK without hydration warning; logout -> same runtime username 404; unknown 404; login demo -> 4 tabs, pinned first, media grid, saved; follow sync, dialog search & paging, QR PNG download with Unsplash avatar; 375 dark, 768 light. NOT visually checked: 1440, keyboard focus rings (class review only)
