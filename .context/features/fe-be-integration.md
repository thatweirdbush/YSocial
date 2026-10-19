---
module: FE-BE Integration (as-built)
description: Implemented state of real-BE adoption in FE; updated per phase exit
updated: 2026-10-19
---

# FE-BE INTEGRATION (AS-BUILT)

> Progress: `features/fe-be-integration-roadmap.md`. Plan & mismatch log: `ysocial-clients/web-app/docs/plans/2026-10-16-fe-be-integration.md`. Contract owner: MAP (`backend/integration/frontend-backend-mapping.md`)

## Phase F - Foundation (auth)

### Slice switch
- `src/lib/api-config.ts`: `NEXT_PUBLIC_REAL_API_SLICES` = cumulative prefix of `auth,content,graph,activity`; gaps & unknown names ignored (warn in dev); `isRealApi(slice)` reads env per call
- `NEXT_PUBLIC_API_BASE_URL` default `https://localhost:49895`; `.env.example` documents both
- Default empty = all mock; tests run mock unless `setRealSlices()` (`src/test/api-test-utils.ts`)

### api-client
- `src/lib/api-client.ts`: `apiFetch<T>` / `apiClient.*`; JSON as-is (no key mapping), 204 -> `undefined`, failures -> `ApiError` (`src/lib/api-error.ts`: `kind` network|http, `code`, `errors`, `traceId`)
- 401 flow: `refreshTokens(sentToken)` -> `refreshed|adopted` retry ONCE; `unauthorized` -> `clearAuth` + `authRedirect.toLogin()` + original 401; `transient` -> throw, session kept
- Auth endpoints pass `skipAuthRefresh: true`

### Refresh coordinator
- `src/lib/token-refresh.ts`: lock `ysocial-refresh` via `navigator.locks`; inside lock re-read storage, stored access != sent -> `adopted`; 401 `InvalidRefreshToken` + stored refresh unchanged -> `unauthorized`
- No `navigator.locks` (insecure context, jsdom) -> in-tab shared promise only; cross-tab race mitigated by adoption, not prevented
- Outcome success variants also carry `refreshToken` (store sync; same-tab writes fire no `storage` event)

### Auth store & service
- `AUTH_STORAGE_KEYS`, `registerAuthStorageSync()` (mounted in `Providers`): any auth-key `storage` event re-reads all keys & applies once, never writes back
- `hydrate()` in real auth mode drops `mock_*` tokens & non-GUID persisted user
- `getDeviceId()`: UUID in `ysocial_device_id`, memory fallback
- `authService` (`features/auth/services/auth-service.ts`): adapter per call (`isRealApi("auth")`); real = register+login, login+`GET me` (`toAuthUser`), best-effort logout, forgot/reset; mock keeps seed demo account & simulated delays
- `authErrorKey` / `authFieldErrors` map BE `code` & `errors` to vi/en messages; `RegisteredLoginFailedError` -> `/login` with notice
- Forms use `useSubmitGuard` (buttons stay enabled, re-submit ignored)
- Mixed mode: real viewer (`MeDto.profile`) is registered as runtime user in mock user DB by `ViewerSync`; `ysocial_mock_user` cookie stays mock bridge for `/@username`

## Design Decisions
- **Tokens in localStorage** (F-D5): XSS exposure accepted for dev; httpOnly cookie/BFF deferred
- **Session ends only on proven invalid refresh token** (F-D7): network/5xx never log user out
- **Contract wins over FE assumptions:** `docs/swagger.json` regenerated from running BE (`npm run api:fetch`, needs `NODE_EXTRA_CA_CERTS` PEM of dev cert), contract test pins used endpoints & schemas

## Pitfall Log
- **OTP smoke:** BE masks OTP digit runs in Development by default; set `Messaging:LogOtpInDevelopment=true` (local `appsettings.Development.json`, gitignored) to read it in BE log (M17 resolved)
- **`.env*` gitignored:** `.gitignore` has `!.env.example`
- **Lint baseline:** 6 pre-existing errors outside integration files (see plan F9 record)

## Phase C - Content

### Slice & ids
- `NEXT_PUBLIC_REAL_API_SLICES=auth,content`: `user-service` & `post-service` dispatch per function to `*.real.ts` via `isRealApi("content")`; stores, op-ledger & components unchanged
- Real adapters never send non-GUID ids (`requireBackendId`/`isBackendId`, `lib/backend-id.ts`): 404 -> `null`/not-found, every other failure rethrown
- `PostRef { id, kind, rootPostId }` is passed to like, bookmark, edit, delete, reply (`PostItem.kind` & `rootPostId` required, mock derives them): endpoint = `posts` vs `comments` by `kind`; reply = `POST comments { postId: rootPostId, parentCommentId? }`

### Mappers & mixed mode
- `post-mapper.ts` / `user-mapper.ts`: swagger has NO required fields (everything optional/nullable): missing id/postId/createdAt = `ApiError` (contract breach), counts/flags default 0/false, unknown `visibility` -> `private`, unknown `followStatus` -> `none`
- `fetchFollowedIds`: pages `GET users/{viewer}/following` (cap 20 pages), never partial
- Relation facade (`relation-service`): content real & graph mock -> reads empty, writes refused (real ids must not enter mock graph)
- Capability table (`lib/capabilities.ts`, `CAPABILITY_RULES`): BE-less features off while content is real (search, tags, trending, suggestions, pin, hide-likes, upload & audience, replies/media tabs, new-posts pill/stream, close-friends badge, guest following tab); graph/mute UI off until Phase G/N; settings sections, followers dialog trigger, notifications mock list gated

### Server pages
- `/@username`: anonymous `serverApiFetch`, only BE 404 -> `notFound()`, other failures -> `error.tsx`; `cache()` shares 1 call between metadata & page; usernames over 30 chars -> 404 without call
- `/posts/[id]`: server reads `threads/{id}` for metadata only (404 -> generic title, page still renders); `PostDetailContainer` waits for auth hydration so follower of private author is not 404'd on hard reload. Deviation from `conventions/frontend.md` §5: soft 404 for unknown ids (no cookie/BFF auth yet); deviation from §4: Zustand + service adapters instead of TanStack Query

### Design decisions & pitfalls
- Optimistic like/bookmark roll back (store toggle + toast) when service rejects
- Local file upload is hidden: blob URLs are unusable by BE; GIF (http URL) is only image source, 1 per post, none in replies
- Dev: dev cert PEM via `NODE_EXTRA_CA_CERTS` in shell that starts `next dev` (server reads), `.env.local` for slices; hard reload on not-yet-compiled route can take seconds (skeleton)
- Windows: CRLF checkout makes `api:check` fail on `generated.ts` (EOL only): run `npm run api:generate` first
- BE `PUT profiles/me` replaces whole profile: FE re-sends cover, `gender: 0` wipes gender/DOB (M18)

## Phase G - Graph

### Slice & adapters
- `auth,content,graph`: `relation-service` & `user-service.fetchFollowList` dispatch per function to `relation-service.real.ts` via `isRealApi("graph")`; stores, op-ledger & components unchanged (every commit already rolls back on any rejection)
- Reads: `fetchFollowList` (followers|following, `locked` kept), `fetchFollowRequests`/`Count`, `fetchBlockedUsers`, `fetchRelationSets` (`blockedBy: []`), `fetchCloseFriendCandidates` (`following` page + `relation-sets` flags, pending dropped)
- Writes: `setBlocked` (POST/DELETE `blocks`), `setCloseFriend` (PATCH `{isCloseFriend}`), `setPrivateAccount` (PUT -> `{acceptedCount}`), `respondFollowRequest` (POST `{decision}`); ids pass `requireBackendId`
- Mute stays facade (`isMuteFacade`: content real & activity mock): reads empty, writes refused, UI hidden by `muteUi`

### Design decisions & pitfalls
- **D14 in FE:** BE 404 on a blocked-either-way profile; anonymous server read cannot know it, so `ProfileContainer` (content real) shows `profile.blockedNotFound` on `null` and an error + retry on any other failure; mock keeps the desync state
- `toUserProfile` forces `isBlockedBy: false`; mock graph still models blocked-by
- `me/blocks` has no `query` (M20): with a query every page is read (cap 20 x 50) & filtered locally with diacritics folding
- `locked: true` follower list = lock empty state (`profile.followListLocked`), never error or "no followers"
- Follow list items carry viewer-relative `followStatus`: only own `following` list means "accepted by viewer"
