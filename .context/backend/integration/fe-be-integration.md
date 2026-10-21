---
module: FE-BE Integration (as-built)
description: Implemented state of real-BE adoption in FE; updated per phase exit
updated: 2026-10-19
---

# FE-BE INTEGRATION (AS-BUILT)

> All phases closed. Plan, execution records & mismatch log (history only): `backend/plans/2026-10-16-fe-be-integration.md`. Contract owner: MAP (`backend/integration/frontend-backend-mapping.md`). Open items & BE track: `.context/roadmap.md`

## Phase F - Foundation (auth)

### Slice switch
- `src/lib/api-config.ts`: `NEXT_PUBLIC_REAL_API_SLICES` = cumulative prefix of `auth,content,graph,activity`; gaps & unknown names ignored (warn in dev); `isRealApi(slice)` reads env per call
- `NEXT_PUBLIC_API_BASE_URL` default `https://localhost:49895`; `.env.example` documents both
- Default (X.1): env UNSET = all 4 slices real; `none` = mock adapters (empty `.env` value also parses as mock, but shells delete empty variables); tests pin `none` in `vitest.setup.ts` & opt in with `setRealSlices()` (`src/test/api-test-utils.ts`)

### api-client
- `src/lib/api-client.ts`: `apiFetch<T>` / `apiClient.*`; JSON as-is (no key mapping), 204 -> `undefined`, failures -> `ApiError` (`src/lib/api-error.ts`: `kind` network|http, `code`, `errors`, `traceId`)
- 401 flow: `refreshTokens(sentToken)` -> `refreshed|adopted` retry ONCE; `unauthorized` -> `clearAuth` + `authRedirect.toLogin()` + original 401; `transient` -> throw, session kept
- Auth endpoints pass `skipAuthRefresh: true`: anonymous (no Bearer) & bounded by 15s timeout; refresh fetch has same timeout (abort = `transient`)

### Refresh coordinator
- `src/lib/token-refresh.ts`: lock `ysocial-refresh` via `navigator.locks`; inside lock re-read storage, stored access != sent -> `adopted`; 401 `InvalidRefreshToken` + stored refresh unchanged -> `unauthorized`
- No `navigator.locks` (insecure context, jsdom) -> in-tab shared promise only; cross-tab race mitigated by adoption, not prevented
- Outcome success variants also carry `refreshToken` (store sync; same-tab writes fire no `storage` event)
- `withRefreshLock(fn)` + unlocked `rotateTokens`: a holder of the lock (profile switch) must NEVER call `refreshTokens`/`apiClient` inside (lock is not re-entrant, 401 refresh would hang); without locks everything shares one in-tab chain. Details & switch failure classes: `features/settings.md`

### Auth store & service
- `AUTH_STORAGE_KEYS`, `registerAuthStorageSync()` (mounted in `Providers`): any auth-key `storage` event re-reads all keys & applies once, never writes back
- `hydrate()` in real auth mode drops `mock_*` tokens & non-GUID persisted user
- `getDeviceId()`: UUID in `ysocial_device_id`, memory fallback
- `authService` (`features/auth/services/auth-service.ts`): adapter per call (`isRealApi("auth")`); real = register+login, login+`GET me` (`toAuthUser`), best-effort logout, forgot/reset; mock keeps seed demo account & simulated delays
- `authErrorKey` / `authFieldErrors` map BE `code` & `errors` to vi/en messages; `RegisteredLoginFailedError` -> `/login` with notice
- Forms use `useSubmitGuard` (buttons stay enabled, re-submit ignored; exported through the auth barrel, needs `"use client"`)
- `authService.switchProfile` (real only) + `auth-store.replaceSession` (tokens + user + cookie in ONE update): see `features/settings.md`
- Mixed mode: real viewer (`MeDto.profile`) is registered as runtime user in mock user DB by `ViewerSync`; `ysocial_mock_user` cookie stays mock bridge for `/@username`

## Design Decisions
- **Tokens in localStorage** (F-D5): XSS exposure accepted for dev; httpOnly cookie/BFF deferred
- **Session ends only on proven invalid refresh token** (F-D7): network/5xx never log user out
- **Contract wins over FE assumptions:** `docs/swagger.json` regenerated from running BE (`npm run api:update`), contract test pins used endpoints & schemas

## Pitfall Log
- **OTP smoke:** BE masks OTP digit runs in Development by default; set `Messaging:LogOtpInDevelopment=true` (local `appsettings.Development.json`, gitignored) to read it in BE log (M17 resolved)
- **Lint baseline:** 0 errors (5 pre-existing fixed in closure sweep); warnings = <img> (avatars/media)

## Phase C - Content

### Slice & ids
- `NEXT_PUBLIC_REAL_API_SLICES=auth,content`: `user-service` & `post-service` dispatch per function to `*.real.ts` via `isRealApi("content")`; stores, op-ledger & components unchanged
- Real adapters never send non-GUID ids (`requireBackendId`/`isBackendId`, `lib/backend-id.ts`): 404 -> `null`/not-found, every other failure rethrown
- `PostRef { id, kind, rootPostId }` is passed to like, bookmark, edit, delete, reply (`PostItem.kind` & `rootPostId` required, mock derives them): endpoint = `posts` vs `comments` by `kind`; reply = `POST comments { postId: rootPostId, parentCommentId? }`

### Mappers & mixed mode
- `post-mapper.ts` / `user-mapper.ts`: swagger has NO required fields (everything optional/nullable): missing id/postId/createdAt = `ApiError` (contract breach), counts/flags default 0/false, unknown `visibility` -> `private`, unknown `followStatus` -> `none`
- `fetchFollowedIds`: pages `GET users/{viewer}/following` (cap 20 pages), never partial
- Relation facade (`relation-service`): content real & graph mock -> reads empty, writes refused (real ids must not enter mock graph)
- Capability table (`lib/capabilities.ts`, `CAPABILITY_RULES`): BE-less features off while content is real (search, tags, trending, suggestions, pin, hide-likes, audience (media upload is real: `mediaUpload` on when content is real, `multiImage` always on; `apiClient.postForm` sends multipart, see `features/media.md`), replies/media tabs, new-posts pill/stream, close-friends badge, guest following tab); graph/mute UI off until Phase G/N; settings sections, followers dialog trigger, notifications mock list gated

### Server pages
- `/@username`: anonymous `serverApiFetch`, only BE 404 -> `notFound()`, other failures -> `error.tsx`; `cache()` shares 1 call between metadata & page; usernames over 30 chars -> 404 without call
- `/posts/[id]`: server reads `threads/{id}` for metadata only (404 -> generic title, page still renders); `PostDetailContainer` waits for auth hydration so follower of private author is not 404'd on hard reload. Deviation from `conventions/frontend.md` §5: soft 404 for unknown ids (no cookie/BFF auth yet); deviation from §4: Zustand + service adapters instead of TanStack Query

### Design decisions & pitfalls
- Optimistic like/bookmark roll back (store toggle + toast) when service rejects
- Local file upload is hidden: blob URLs are unusable by BE; GIF (http URL) is only image source, 1 per post, none in replies
- Dev TLS: server components fetch BE from Node, which ignores OS trust store by default -> `self-signed certificate` -> `ApiError: Network` -> `/@username` "Couldn't load this profile". `dev`/`start`/`api:fetch` run `node --use-system-ca` (trust via `dotnet dev-certs https --trust`); `NODE_EXTRA_CA_CERTS` PEM stays alternative; NEVER `NODE_TLS_REJECT_UNAUTHORIZED=0`
- `.env.local` for slices; hard reload on not-yet-compiled route can take seconds (skeleton)
- Windows: CRLF checkout makes `api:check` fail on `generated.ts` (EOL only): run `npm run api:generate` first
- `PUT profiles/me`: FE re-sends current cover & omits gender/DOB (BE keeps stored values, M18)
- List mappers drop malformed item (warn) instead of failing the page; thread's own post stays strict
- Post-detail metadata: BE outage -> neutral title (page body has its own client error state); only BE 404 gives not-found title
- Saved list: `SavedList` is keyed by viewer id (switch/logout remounts, no stale items); 10-page cap (100 posts) shows `saved.truncated`

## Phase G - Graph

### Slice & adapters
- `auth,content,graph`: `relation-service` & `user-service.fetchFollowList` dispatch per function to `relation-service.real.ts` via `isRealApi("graph")`; stores, op-ledger & components unchanged (every commit already rolls back on any rejection)
- Reads: `fetchFollowList` (followers|following, `locked` kept), `fetchFollowRequests`/`Count`, `fetchBlockedUsers`, `fetchRelationSets` (`blockedBy: []`), `fetchCloseFriendCandidates` (`following` page + `relation-sets` flags, pending dropped)
- Writes: `setBlocked` (POST/DELETE `blocks`), `setCloseFriend` (PATCH `{isCloseFriend}`), `setPrivateAccount` (PUT -> `{acceptedCount}`), `respondFollowRequest` (POST `{decision}`); ids pass `requireBackendId`
- Mute stays facade (`isMuteFacade`: content real & activity mock): reads empty, writes refused, UI hidden by `muteUi`

### Design decisions & pitfalls
- **D14 in FE:** BE 404 on blocked-either-way profile; anonymous server read cannot know it, so `ProfileContainer` (content real) shows `profile.blockedNotFound` on `null` & error + retry on any other failure; mock keeps desync state
- `toUserProfile` forces `isBlockedBy: false`; mock graph still models blocked-by
- `me/blocks?query`: BE search (RelationSearch), same adapter helper as other relation lists (M20)
- `locked: true` follower list = lock empty state (`profile.followListLocked`), never error or "no followers"
- Follow list items carry viewer-relative `followStatus`: only own `following` list means "accepted by viewer"

## Phase N - Activity

### Slice & adapters
- `auth,content,graph,activity`: `relation-service` mute functions dispatch to `relation-service.real.ts` via `isRealApi("activity")` (PUT/DELETE `relations/mute`, `GET me/mutes` with `query`); before that mute is facade (reads empty, writes refused, `muteUi` hidden)
- `notification-service.ts` (mock seed adapter / real `GET notifications`, `unread-count`, `PUT {id}/read`, `PUT read-all`), `notification-mapper.ts` (`type`/`kind` -> `like|reply|follow|other`, `targetId` -> post link, sender -> user), 1 shared `notification-store` (HTTP pages + push, optimistic read with rollback, reset drops in-flight loads)
- SignalR: `lib/signalr-client.ts` `createNotificationHub(factory)` (injectable connection), `start(getAccessToken)` only with token, token read on every reconnect; failed start or final close retries with backoff (5s doubling, cap 60s) until `stop()` (M22); `onResume` fires after library reconnect or successful retry & `refreshNotifications` merges missed items on top (M21); `NotificationLiveSync` in `Providers` runs it for signed-in viewer + activity real, stops & resets list on logout/account switch

### Design decisions & pitfalls
- Real items carry no follow state: follow-back button is mock-only; unknown BE types render generic (`other` + `message`)
- Push from blocked sender is dropped (`getViewerRelations`); malformed push dropped without breaking stream; blocking user purges their items from open list (`dropNotificationsFrom`)
- List is HTTP-first, push covers events after socket connects; gaps are healed by resume refresh (page 1 only: gap longer than 1 page is not recovered)
- Content real & activity mock: list stays empty (seed items reference mock users)
- Unread badge, filter tabs & settings are still FE roadmap Phase 3

## Phase X - Cleanup

- Default flipped: `parseRealSlices(undefined)` = `auth,content,graph,activity`; `NEXT_PUBLIC_REAL_API_SLICES=none` = mock mode (`.env.example`, README). `npm run dev` needs BE running unless `none`
- Mock code kept: proof scan found no mock export that lost its last consumer (mock mode, partial slice lists & BE-less features still reach every mock adapter); `ysocial_mock_user` cookie bridge, `ViewerSync` mock upsert & `[@username]` cookie resolver stay for mock mode
- X.2 done: BE toggle endpoints removed (FE had 0 calls); types regenerated
- Smoke evidence: 2 tabs + corrupted shared access token -> exactly 1 `refresh-token` call (`navigator.locks`), no forced logout

## Deviations from MAP
- Post delete moved CP1 -> Phase C (no real post ids while posts were mocked)
- Follow/unfollow moved CP3 -> Phase C; feed read moved CP4 -> Phase C (mock ids must not reach real routes); mute stayed CP4
- Slice switch is cumulative (`auth` -> `content` -> `graph` -> `activity`)
- Profile switcher (FE roadmap 2.7) is not mock replacement: built real-first, DONE (`features/settings.md`)
