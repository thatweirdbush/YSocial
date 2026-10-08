---
module: Profile Core (FE, mock data) - roadmap F0.6 + 2.1 + 2.2 + 2.6 (Phase 2A)
updated: 2026-10-08
spec: ysocial-clients/web-app/docs/specs/2026-10-07-profile-core-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-07-profile-core.md
---

# Profile Core

`/@username` on mocks: header, follow, edit (own), tabs Threads / Replies / Media / Saved(own), followers/following dialog, share (link + QR). NEVER calls BE (`features/profile` has 0 `apiClient`).

## Data flow
```
page.tsx (server) : params + cookies() -> parseMockSession -> resolveProfileRoute -> notFound() | <ProfileContainer key={username}>
Providers         : useLayoutEffect hydrate() -> <ViewerSync/> ensureViewerUser (once per session id, after hydrated)
ProfileContainer  : !hydrated -> ProfileSkeleton ; ProfileLookup (ensureViewerUser | ensureUserByUsername) -> ProfileView
ProfileView       : useProfileTabPostsController(user.id, actorId) -> ProfileTabPanel(tab) -> post-store (posts) / ProfileMediaGrid
FollowButton / FollowersDialog -> commitFollow -> toggleFollow (optimistic) -> setFollow -> refreshUsers (only if no newer toggle)
```

## Key rules
- **Identity:** `useViewerId(): string | null` = authenticated identity (own-profile, Saved, Edit, route). `useActorId()` = legacy mutation actor (`"me"` for guest) ONLY for mock services/stores. NEVER mix.
- **Counts:** visible = `HIDDEN_*` baseline (`profile/mocks`) + graph relation count (`src/mocks/follow-graph.ts`, forward + reverse index, `link()` only mutation). No stored counts. Dialog lists a partial dataset by design.
- **Fans:** `src/mocks/seed-fans.ts`, mulberry32(0x5eed), 30-60 per base user, follow only their base user, 0 followers. Excluded from suggestions, included in search & follow lists.
- **Session cookie** `ysocial_mock_user` = `{ id, username }` ONLY. Client-writable, NOT an auth boundary (never reuse as real auth). Lets the server resolve the current session's runtime user; another session's runtime user = 404.
- **Mock login** always signs in `SEED_DEMO_ACCOUNT` (`1`, `@ysocial_member`). Register issues id `2` for every new account.
- **Tab state** lives in the profile controller (context), keyed by `userId:actorId`; per-tab request tokens; scope change resets all tabs. `post-store` holds only posts + `usePinnedPostId`.
- **PostCard** author = `useUser(post.user.id) ?? post.user` (profile edits show everywhere).
- **Composer:** profile emits `onCreatePost`; container -> `ui-store.openComposer()`; `MainLayout` owns the dialog (no `PostCreatorDialog` import in profile).
- **Tech debt:** see spec §11 (profile<->posts cycle, guest gating, per-viewer bookmarks, shared mock store).

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
   - **Symptom:** unknown `/@x` showed the not-found UI with HTTP 200.
   - **Root Cause:** `loading.tsx` makes Next stream the shell first, so `notFound()` cannot change the status.
   - **Fix & Decision:** no `loading.tsx` on this route (page awaits only params + cookies). Client hydration gating keeps `ProfileSkeleton`.
   - **Verification:** `curl -w %{http_code}` 200 -> 404 after removal; `page.test.tsx`.
2. **Register reuses id `2`**
   - **Symptom:** register `alice`, logout, register `bob` -> own profile skeleton forever.
   - **Root Cause:** `ensureViewerUser` promise cached by id only; `upsertViewerUser` skipped existing id.
   - **Fix & Decision:** key by `id:username`; upsert replaces a runtime row when the username differs; register schema restricts usernames to the session-cookie shape and rejects seed usernames.
   - **Verification:** user-store, user-service, `register-schema.test.ts`.
3. **IntersectionObserver in the preview pane** only fires when a frame is produced (screenshot); infinite scroll looked broken during manual QA but was fine. Not an app bug.
4. **Hooks order for scope reset:** child passive effects run before parent effects, so scope bookkeeping (`latest` ref, tokens) uses `useLayoutEffect`; derived `IDLE_TABS` when `scopeKey` mismatches.

## Verification (2026-10-08)
- `npm run test`: 56 files / 521 tests pass; `tsc` exit 0; `next build` OK; eslint 55 E / 17 W (baseline 62 / 25), no file/rule increase.
- Browser pane: register -> own profile -> reload OK without hydration warning; logout -> same runtime username 404; unknown 404; login demo -> 4 tabs, pinned first, media grid, saved; follow sync, dialog search & paging, QR PNG download with Unsplash avatar; 375 dark, 768 light. NOT visually checked: 1440, keyboard focus rings (class review only).
