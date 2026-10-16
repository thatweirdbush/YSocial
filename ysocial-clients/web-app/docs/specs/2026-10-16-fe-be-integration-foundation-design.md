---
module: FE-BE Integration Foundation (Design)
updated: 2026-10-16
status: draft
---

# FE-BE INTEGRATION - PHASE F (FOUNDATION) DESIGN

- **Roadmap:** `.context/features/fe-be-integration-roadmap.md` Phase F
- **Contract owner:** `.context/backend/integration/frontend-backend-mapping.md` (MAP §n); BE auth lifecycle: `.context/backend/architecture/backend-guide.md` (BG §6)
- **Source of facts:** FE code read 2026-10-16 (`src/lib/api-client.ts`, `features/auth/*`, `features/profile/components/viewer-sync.tsx`, `package.json`)

## 1. Goal & scope
- **Goal:** FE auth runs against the real BE (`https://localhost:49895`) so the frozen contract is proven from the FE side
- **In scope:** register, login, viewer bootstrap, silent refresh, logout, forgot/reset password, API plumbing, error-code messages
- **Out of scope:** every other slice (stays mock), profile switcher (Phase C), post delete (Phase C), httpOnly cookie/BFF auth, SSR authenticated fetch, SignalR
- **Success:** login -> refresh -> logout works on real BE across 2 tabs without a forced logout; every auth `code` maps to a user message; mock mode still passes all existing tests

## 2. As-is findings (drive the design)
| Finding | Consequence |
|---|---|
| `api-client.ts` exists, 0 importers | safe to rewrite; no migration |
| refresh queue is in-module (1 tab) | 2 tabs rotate same single-use token -> loser 401 -> all tabs logged out (MAP §1) |
| only `/refresh-token` path skips the 401 interceptor | login 401 `InvalidCredentials` would trigger a refresh attempt |
| any refresh failure = `clearAuth` + redirect `/auth/login` | network/5xx logs user out; route is wrong (`/login`) |
| errors rejected as raw object `{status, ...body}` | no typed `code` switch |
| `camelCaseKeys` mapper + `AccessToken` PascalCase fallback | BE is camelCase already; mapper is dead weight & risk |
| `BASE_URL` hard-coded, no `.env*` | needs env config |
| `api:update` calls missing `api:fetch` | script broken |
| forms call `setTokens("mock_access_token")` + `updateUser` inline | need a service seam |
| `AuthUser {id,email,displayName?,avatarUrl?,bio?,username?}` | maps from `MeDto` (profile + email) |
| register schema rejects seed usernames (mock-only rule) | must not apply in real mode (BE: 409 `UsernameTaken`) |
| tokens + user in localStorage; `ysocial_mock_user` cookie written by `updateUser` | keep both; cookie stays a mock bridge for `/@username` |
| `ViewerSync` -> `ensureViewerUser` registers viewer in mock user DB by `id:username` | reuse as mixed-mode bridge |

## 3. Decisions
- **F-D1 Docs:** Tier 1 roadmap + this spec; Tier 2 plan follows after spec approval; earlier draft plan under `.context/backend/plans/` removed
- **F-D2 Slice switch:** env `NEXT_PUBLIC_REAL_API_SLICES` (comma list, e.g. `auth`), default empty = all mock; `NEXT_PUBLIC_API_BASE_URL` default `https://localhost:49895`; helper `isRealApi(slice)` in `src/lib/api-config.ts`; tests run in mock mode unless a test sets the slice
- **F-D3 Service seam:** `features/auth/services/auth-service.ts` exposes one interface, chosen per call by `isRealApi("auth")`; mock adapter keeps today's behavior (seed demo account, reserved usernames); real adapter calls BE
- **F-D4 Mixed mode:** real viewer = `MeDto.profile` mapped to `AuthUser`; `ViewerSync`/`ensureViewerUser` registers it as a runtime user in the mock user DB so mock slices keep working; real viewer has no mock relations/posts (profile near-empty) until its slice goes real; no seed-id alignment
- **F-D5 Tokens:** localStorage (already cross-tab); server components stay mock so no server-side cert issue; browser must trust the BE dev cert; httpOnly cookie/BFF deferred (XSS exposure accepted for dev)
- **F-D6 Refresh:** cross-tab single-flight via `navigator.locks`; fallback to in-tab promise when unavailable (documented gap)
- **F-D7 Logout policy:** clear session ONLY on 401 `InvalidRefreshToken` or missing refresh token; network error/5xx keeps session & surfaces `ApiError`
- **F-D8 Register:** real flow = `POST register` (201, no tokens) then `POST login` with email; if login fails after a successful register, route to `/login` with "account created" notice

## 4. Architecture (units)
| Unit | File | Responsibility | Depends on |
|---|---|---|---|
| API config | `src/lib/api-config.ts` | `API_BASE_URL`, `isRealApi(slice)` | env |
| ApiError | `src/lib/api-error.ts` | typed error: `kind: "network"\|"http"`, `status`, `code`, `title`, `detail`, `errors`, `traceId`; `parseProblem(Response)`; `isApiError`, `hasCode` | - |
| Refresh coordinator | `src/lib/token-refresh.ts` | `refreshTokens(sentAccessToken)`: lock, re-read storage, skip if rotated, else call refresh; result `refreshed \| adopted \| failed(unauthorized\|transient)` | auth-store (storage keys), `ApiError` |
| API client | `src/lib/api-client.ts` | request builder, `Authorization`, JSON, `skipAuthRefresh`, retry once after refresh, throws `ApiError` | config, ApiError, coordinator |
| Auth service | `features/auth/services/auth-service.ts` (+ mock/real adapters) | `register`, `login`, `logout`, `forgotPassword`, `resetPassword`, `fetchMe` | api-client, auth-store |
| Auth error map | `features/auth/utils/auth-error.ts` | `code` -> i18n key (domain `auth.*`), unknown -> generic | ApiError |
| Auth store sync | `features/auth/store/auth-store.ts` | `storage` event listener: other tab changed/removed tokens -> adopt/clear local state without writing | - |
| Device id | `features/auth/utils/device-id.ts` | persisted UUID `ysocial_device_id` for login body | localStorage |
| Types | `src/lib/api/generated.ts` (regenerated), `features/auth/types` re-exports | DTO types from BE swagger | `npm run api:generate` |

## 5. Data flows
- **Login:** form -> `authService.login(loginId, password)` -> `POST login {loginId,password,deviceId}` (`skipAuthRefresh`) -> `setTokens` -> `GET users/me` -> `updateUser(MeDto -> AuthUser)` -> redirect `/`; `me` failure after login = `clearAuth` + error
- **Register:** `POST register {email,password,username,phoneNumber?}` -> `login(email)` (F-D8)
- **Silent refresh:** request 401 (not an auth-endpoint call, not already retried) -> `refreshTokens(sentAccessToken)`: take lock -> read stored refresh/access tokens -> if stored access token != sent -> `adopted` (retry with stored) else `POST refresh-token` -> `setTokens` -> retry original ONCE; second 401 rejects
- **Refresh failure:** 401 `InvalidRefreshToken` -> `clearAuth` + redirect `/login`; network/5xx -> reject `ApiError` (`kind` network/http), session kept
- **Logout:** best-effort `POST logout {refreshToken}` (BE always 204), then `clearAuth` regardless of result; other tabs drop session via storage event
- **Forgot/reset:** `POST forgot-password {loginId}` (always 204; OTP read from BE dev log) -> `POST reset-password {loginId,otp,newPassword}`; 400 `InvalidOtp`/`OtpAttemptsExceeded` shown inline; success returns to login
- **Auth endpoints skip the interceptor:** register, login, refresh-token, logout, forgot-password, reset-password

## 6. Error handling
- Body = ProblemDetails (MAP §1); FE switches on `code` (MAP §1.1), falls back to `status` when body is not JSON
- Auth-slice codes mapped to messages: `ValidationFailed` (+ `errors` per field), `EmailTaken`, `UsernameTaken`, `InvalidCredentials`, `AccountInactive`, `InvalidRefreshToken`, `InvalidOtp`, `OtpAttemptsExceeded`, `BusinessRuleViolated`, `Unauthenticated`, `InternalError`, network (`kind: "network"`)
- i18n: only domain `auth.*` here; flat keys & values defined in the plan
- Non-JSON failure (CORS, cert, offline, proxy HTML) -> `ApiError{kind:"network"|"http", code:"Unknown"}`, never a raw throw

## 7. Mismatch policy
- Any FE/BE disagreement found while implementing is logged in the plan's mismatch table with a decision (BE fix, FE fix, or MAP update) before code changes
- BE change only for a proven contract defect, with an integration test (BE repo rules)

## 8. Testing strategy
- **Unit (Vitest):** `parseProblem`/`ApiError` (each status & non-JSON), coordinator (locks, rotated token, transient vs unauthorized), `api-client` (retry once, skip list, headers), `auth-service` real adapter against mocked `fetch`, `auth-error` map, auth-store storage sync
- **Mock mode regression:** existing auth tests stay green with no env set
- **Manual smoke (real BE, Development seed):** register -> login -> reload -> forced refresh -> logout, in 2 tabs; BE restart mid-session; wrong password; reset flow with OTP from BE log

## 9. Review Focus (each gets a test in the owning plan task)
- 2 tabs refresh at the same moment: exactly 1 refresh call, no logout
- 401 `InvalidCredentials` from login must NOT trigger refresh
- 401 from the refresh call itself must not trigger another refresh
- After refresh the original request retries once, never loops
- BE restart mid-session: refresh 401 -> clean logout & `/login`
- Non-JSON failure (CORS, cert, offline) -> typed `ApiError`, session kept
- Register OK but login fails -> user lands on `/login` with notice, no half-signed-in state
- Logout with network failure still clears local session

## 10. Open items to verify at plan time
- Swagger endpoint path for `api:fetch` (BE Development only)
- Whether browsers without `navigator.locks` matter for the supported matrix (fallback documented)
- Exact `generated.ts` diff after regeneration (types the FE already imports must still compile)
- Register schema split: reserved-username rule only in mock adapter (`getRegisterSchema` options)
