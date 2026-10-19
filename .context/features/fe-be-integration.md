---
module: FE-BE Integration (as-built)
description: Implemented state of real-BE adoption in FE (Phase F auth so far); updated per phase exit
updated: 2026-10-19
---

# FE-BE INTEGRATION (AS-BUILT)

> Progress: `features/fe-be-integration-roadmap.md`. Plan & mismatch log: `ysocial-clients/web-app/docs/plans/2026-10-16-fe-be-integration.md`. Contract owner: MAP (`backend/integration/frontend-backend-mapping.md`)

## Phase F - Foundation (auth) as-built

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
- Mixed mode: real viewer (`MeDto.profile`) is registered as runtime user in mock user DB by `ViewerSync`; `ysocial_mock_user` cookie stays the mock bridge for `/@username`

## Design Decisions
- **Tokens in localStorage** (F-D5): XSS exposure accepted for dev; httpOnly cookie/BFF deferred
- **Session ends only on proven invalid refresh token** (F-D7): network/5xx never log the user out
- **Contract wins over FE assumptions:** `docs/swagger.json` regenerated from running BE (`npm run api:fetch`, needs `NODE_EXTRA_CA_CERTS` PEM of dev cert), contract test pins used endpoints & schemas

## Pitfall Log
- **BE worktree build:** worktree lacks sibling `Microservice.BuildingBlocks` (relative project refs); run BE from main checkout
- **OTP smoke:** BE masks OTP digit runs in Development by default; set `Messaging:LogOtpInDevelopment=true` (local `appsettings.Development.json`, gitignored) to read it in the BE log (M17 resolved)
- **`.env*` gitignored:** `.gitignore` has `!.env.example`
- **Lint baseline:** 6 pre-existing errors outside integration files (see plan F9 record)
