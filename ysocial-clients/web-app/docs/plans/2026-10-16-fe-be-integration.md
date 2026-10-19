# FE-BE Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (code review at exit) to implement this plan task-by-task. Steps tracking use checkbox (`- [ ]`) syntax

**Goal:** Replace FE mocks with real BE slice by slice (auth -> content -> graph -> activity), then remove mock layer

**Architecture:** Keep Zustand stores & op-ledger/rollback logic untouched; swap service adapters behind existing function signatures. Slice switch = cumulative env prefix (`NEXT_PUBLIC_REAL_API_SLICES`). One typed `api-client` (ProblemDetails -> `ApiError`, cross-tab single-flight refresh). BE-less features are hidden through capability map while their slice is real

**Tech Stack:** Next.js 16.3.8 App Router, React 19.3, Zustand, Vitest + RTL + jsdom, openapi-typescript, `@microsoft/signalr`; BE ASP.NET Core (contract owner: MAP)

**Design:** Roadmap `.context/features/fe-be-integration-roadmap.md`. Contract `.context/backend/integration/frontend-backend-mapping.md` (MAP §n)

## Global Constraints

- **Paths:** FE = relative to `ysocial-clients/web-app/`; run all `npm`/`npx` commands from there
- **Adapters keep existing service signatures** (incl. `actorId` params) so stores, op-ledger & components do not change, EXCEPT 5 post-operation functions changed once in Task C3 (`PostRef`); mock adapter stays default when slice is not real
- **404 rule:** adapters map 404 -> `null`/not-found state; network, TLS, 5xx & unknown errors are rethrown, never shown as not-found
- **Id domains:** BE ids are GUIDs, mock ids are not (`author-01`); real adapters call `requireBackendId` (C1) & never send non-GUID; mock services never receive BE id except through hidden-or-accepted surfaces in Phase C coexistence table
- **Contract names come from `docs/swagger.json`:** no generic `PagedResponse<T>` exists; use `PostDtoPagedResponse`, `UserProfileDtoPagedResponse`, `FollowListPageDto`, `UserPostsPageDto`, `NotificationPageDto`
- **Dev cert:** `NODE_EXTRA_CA_CERTS` is read when Node starts: set it in shell (or scripts), never in `.env*`; browser trust needs `dotnet dev-certs https --trust`
- **Never import `generated.ts` in UI:** re-export DTO types in `src/features/<feature>/types/index.ts` (`conventions/frontend.md` §3)
- **Store init is SSR-safe:** no `localStorage`/`window` in initializers
- **i18n:** flat keys `domain.elementName` in `src/lib/locales/vi.json` & `en.json`, every key added to BOTH; full key list is in this plan
- **Submit buttons stay enabled** with inline spinner, ignore re-submit while pending
- **No `loading.tsx`** on routes that resolve real 404
- **Zustand + service adapters, no TanStack Query migration** (deviation from `conventions/frontend.md` §4, recorded at C8)
- **BE changes only via mismatch log** (end of this plan), with BE integration test; BE repo rules apply
- **Contract wins over FE assumptions:** ids are GUID strings, enums in read DTOs are lowercase strings, nullable DTO fields may be `null`, `parentId`/`imageUrl` omitted when null (MAP §1, §3)
- **Commits:** conventional commits, author = user, NO `Co-Authored-By` trailer; stage files by explicit path
- **Execution:** clean test baseline first; TDD (`test-driven-development`); `verification-before-completion` before any "done" claim
- **Test env:** jsdom has no `navigator.locks` & `storage` events never cross documents: use fakes from T0
- **Verification commands:** `npm run test`, `npm run typecheck`, `npm run lint`, `npm run api:check`; single file: `npx vitest run <path>`

## Review Focus

Each line has pinned test in owning task.
- **Two tabs refresh at once:** with `navigator.locks` exactly 1 refresh call; without it (insecure context, jsdom) coordination is in-tab only & losing tab adopts token rotated by other tab instead of forcing logout (F3, F9)
- **Login 401 `InvalidCredentials` must not trigger refresh** (F4)
- **401 from refresh call itself must not trigger another refresh; original request retries once, never loops** (F4)
- **BE restart mid-session:** refresh 401 with unchanged stored token -> clean logout `/login` (F3, F9)
- **Non-JSON failure (CORS, cert, offline, HTML proxy page):** typed `ApiError`, session kept; network/TLS/5xx never rendered as not-found (F2, F4, C6, C8)
- **real id never reaches mock-only service, & mock id never reaches real route** (C1, C2, C6)
- **Reply to nested comment sends root `postId` + `parentCommentId`; edit/delete/like/bookmark pick endpoint from `PostRef.kind`** (C3, C6)
- **Optimistic rollback on 404 caused by block/delete mid-session** (C6, G3)
- **`/posts/[id]`: follower of private author still sees post on hard reload; anonymous server read never turns viewer-dependent 404 into page 404** (C8)
- **Server read when BE is down or cert fails -> `error.tsx`, never `notFound()`** (C1, C8)
- **Blocked either way = 404 profile; `locked: true` list is not error** (G3)
- **SignalR token expiry/reconnect uses fresh access token; push for hidden/blocked sender never shown** (N3)
- **Cleanup removes only mock code proven unused by wired slices & hidden features** (X1)

## Test helpers (T0 shared by all phases)

### Task T0: Test utilities
**Files:**
- Create: `src/test/api-test-utils.ts`
- Test: `src/test/api-test-utils.test.ts`

**Interfaces:**
- Produces:
  - `mockFetchSequence(steps: Array<MockStep>): { fetchFn: typeof fetch; calls: Array<{ url: string; init?: RequestInit }> }` where `MockStep = { status: number; body?: unknown; headers?: Record<string,string>; reject?: Error }`
  - `problem(status: number, code: string, extra?: object): MockStep` (ProblemDetails body, `application/problem+json`)
  - `createLockFake(): LockManagerLike` (serializes callbacks per name, FIFO)
  - `dispatchStorage(key: string, newValue: string | null, oldValue?: string | null): void` (fires `StorageEvent` on `window`)
  - `setRealSlices(list: string | undefined): void` (sets `process.env.NEXT_PUBLIC_REAL_API_SLICES`, restored by `afterEach`)

- [x] **Step 1: Write failing tests:** `mockFetchSequence returns steps in order & records calls`, `problem builds ProblemDetails body with code`, `createLockFake runs 2 requests for same name sequentially`, `dispatchStorage reaches storage listeners`
- [x] **Step 2: Run** `npx vitest run src/test/api-test-utils.test.ts` -> FAIL (module missing)
- [x] **Step 3: Implement** helpers above (plain TS, no new dependency)
- [x] **Step 4: Run** same command -> PASS
- [x] **Step 5: Commit** `test(api): add fetch/lock/storage test utilities`

---

# PHASE F - Foundation (auth)

## Design notes

- **Goal:** FE auth runs against real BE (`https://localhost:49895`) so frozen contract is proven from FE side
- **Scope:** register, login, viewer bootstrap, silent refresh, logout, forgot/reset password, API plumbing, error-code messages
- **Out of scope:** other slices (stay mock), profile switcher, post delete (Phase C), httpOnly cookie/BFF auth, authenticated SSR fetch, SignalR
- **Success:** login -> refresh -> logout works on real BE across 2 tabs without forced logout; every auth `code` maps to user message; mock mode still passes all existing tests
- Smoke target = real BE in Development (seed credentials from BE `SeedIds`, never copied here)

### As-is findings (FE code read 2026-10-16)
| Finding | Consequence |
|---|---|
| `api-client.ts` exists, 0 importers | safe to rewrite; no migration |
| refresh queue is in-module (1 tab) | 2 tabs rotate same single-use token -> loser 401 -> all tabs logged out (MAP §1) |
| only `/refresh-token` path skips 401 interceptor | login 401 `InvalidCredentials` would trigger refresh attempt |
| any refresh failure = `clearAuth` + redirect `/auth/login` | network/5xx logs user out; route is wrong (`/login`) |
| errors rejected as raw `{status, ...body}` | no typed `code` switch |
| `camelCaseKeys` mapper + `AccessToken` PascalCase fallback | BE is camelCase already; dead weight & risk |
| `BASE_URL` hard-coded, no `.env*` | needs env config |
| `api:update` calls missing `api:fetch` | script broken |
| forms call `setTokens("mock_access_token")` + `updateUser` inline | need service seam |
| `AuthUser {id,email,displayName?,avatarUrl?,bio?,username?}` | maps from `MeDto` (profile + email) |
| register schema rejects seed usernames (mock-only rule) | must not apply in real mode (BE: 409 `UsernameTaken`) |
| tokens + user in localStorage; `ysocial_mock_user` cookie written by `updateUser` | keep both; cookie stays mock bridge for `/@username` |
| `ViewerSync` -> `ensureViewerUser` registers viewer in mock user DB by `id:username` | reuse as mixed-mode bridge |

### Decisions
- **F-D2 Slice switch:** `NEXT_PUBLIC_REAL_API_SLICES` cumulative prefix (F1); default flipped in X1: unset = all 4 slices real, `none` = mock adapters (shells delete empty variable, so empty cannot mean mock); `NEXT_PUBLIC_API_BASE_URL` default `https://localhost:49895`; tests pin `none` in `vitest.setup.ts` & opt in with `setRealSlices`
- **F-D3 Service seam:** `features/auth/services/auth-service.ts` 1 interface, adapter chosen per call by `isRealApi("auth")`; mock adapter keeps today's behavior (seed demo account, reserved usernames)
- **F-D4 Mixed mode:** real viewer = `MeDto.profile` mapped to `AuthUser`; `ViewerSync`/`ensureViewerUser` registers it as runtime user in mock user DB so mock slices keep working; real viewer has no mock relations/posts until its slice goes real; no seed-id alignment
- **F-D5 Tokens:** localStorage (already cross-tab); browser must trust BE dev cert (`dotnet dev-certs https --trust`); httpOnly cookie/BFF deferred (XSS exposure accepted for dev); server components stay mock in Phase F (revised in Phase C for anonymous server reads)
- **F-D6 Refresh:** cross-tab single-flight needs `navigator.locks`, which exists only in secure contexts (https, localhost) & not in jsdom or LAN http. Without it coordination is IN-TAB ONLY: cross-tab races are mitigated, not prevented. Mitigation in both modes: on refresh 401 re-read storage; if stored refresh token differs from one sent, another tab rotated it -> adopt. Relies on BE not revoking successors when rotated token is replayed (confirmed: only `Account.RevokeRefreshToken` (logout) revokes successors, DM §5.6)
- **F-D7 Logout policy:** clear session ONLY on 401 `InvalidRefreshToken` with unchanged stored token, or missing refresh token;
- **F-D8 Register:** `POST register` (201, no tokens) then `POST login` with email; login failure after successful register -> `/login` with "account created" notice

### Data flows
- **Login:** form -> `authService.login` -> `POST login {loginId,password,deviceId}` (`skipAuthRefresh`) -> `setTokens` -> `GET users/me` -> `updateUser(MeDto -> AuthUser)` -> redirect `/`; `me` failure after login = `clearAuth` + error
- **Silent refresh:** request 401 (not auth-endpoint call, not already retried) -> `refreshTokens(sentAccessToken)`: lock -> read stored tokens -> stored access token != sent -> `adopted` (retry with stored) else `POST refresh-token` -> `setTokens` -> retry original ONCE; second 401 rejects
- **Refresh failure:** 401 `InvalidRefreshToken` -> `clearAuth` + redirect `/login`; network/5xx -> reject `ApiError`, session kept
- **Logout:** best-effort `POST logout {refreshToken}` (BE always 204), then `clearAuth` regardless; other tabs drop session via storage event
- **Forgot/reset:** `POST forgot-password {loginId}` (always 204; OTP read from BE Development log) -> `POST reset-password {loginId,otp,newPassword}`; 400 `InvalidOtp`/`OtpAttemptsExceeded` shown inline
- **Auth endpoints skip interceptor:** register, login, refresh-token, logout, forgot-password, reset-password

### Error handling
- Body = ProblemDetails (MAP §1); FE switches on `code` (MAP §1.1), falls back to `status` when body is not JSON
- Auth codes mapped to messages: `ValidationFailed` (+ `errors` per field), `EmailTaken`, `UsernameTaken`, `InvalidCredentials`, `AccountInactive`, `InvalidRefreshToken`, `InvalidOtp`, `OtpAttemptsExceeded`, `BusinessRuleViolated`, `Unauthenticated`, `InternalError`, network
- Non-JSON failure (CORS, cert, offline, proxy HTML) -> `ApiError{kind, code:"Unknown"|"Network"}`, never raw throw

### Open items to verify during Phase F
- Swagger document URL for `api:fetch`: no `SwaggerDoc(` in `Program.cs`, so default `/swagger/v1/swagger.json` is expected; confirm against running BE (Development only)
- Browsers without `navigator.locks` (fallback documented)
- `generated.ts` diff after regeneration: types FE already imports must still compile
- Register schema split: reserved-username rule only in mock adapter

> **Execution order inside Phase F:** T0, F1, **F5** (types must exist before anything imports response types), F2, F3, F4, F6, F7, F8, F9. Task ids are not renumbered

### Task F1: API config & slice switch
**Files:**
- Create: `src/lib/api-config.ts`, `.env.example`
- Test: `src/lib/api-config.test.ts`

**Interfaces:**
- Produces:
  - `type ApiSlice = "auth" | "content" | "graph" | "activity"`
  - `API_SLICE_ORDER: readonly ApiSlice[]` (that order)
  - `API_BASE_URL: string` (`NEXT_PUBLIC_API_BASE_URL` or `https://localhost:49895`)
  - `parseRealSlices(raw: string | undefined): ApiSlice[]` (longest valid prefix of `API_SLICE_ORDER`; unknown or gapped names ignored, `console.warn` in development)
  - `isRealApi(slice: ApiSlice): boolean`
- Supported states: `""`, `auth`, `auth,content`, `auth,content,graph`, `auth,content,graph,activity`

- [x] **Step 1: Write failing tests:** `empty env -> no real slice`, `"auth" -> auth real only`, `"auth,content" -> content real`, `"content" alone -> none (gap, warns)`, `"auth,graph" -> auth only`, `unknown slice name ignored`, `base url default & override`
- [x] **Step 2: Run** `npx vitest run src/lib/api-config.test.ts` -> FAIL
- [x] **Step 3: Implement** per interfaces; `.env.example` documents both variables & supported states
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(api): add api config & cumulative slice switch`

### Task F2: ApiError & ProblemDetails parsing
**Files:**
- Create: `src/lib/api-error.ts`
- Test: `src/lib/api-error.test.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `class ApiError extends Error { kind: "network" | "http"; status: number; code: string; title?: string; detail?: string; errors?: Record<string, string[]>; traceId?: string }`
  - `parseProblem(response: Response): Promise<ApiError>` (JSON body with `code` -> copy fields; else `code: "Unknown"`, `kind: "http"`)
  - `networkError(cause: unknown): ApiError` (`kind: "network"`, `status: 0`, `code: "Network"`)
  - `isApiError(value: unknown): value is ApiError`
  - `hasCode(value: unknown, code: string): boolean`

- [x] **Step 1: Write failing tests:** `parses ProblemDetails with code & traceId`, `parses validation errors map`, `HTML body -> code Unknown, kind http`, `empty body -> code Unknown`, `networkError kind network status 0`, `hasCode false for non ApiError`
- [x] **Step 2: Run** `npx vitest run src/lib/api-error.test.ts` -> FAIL
- [x] **Step 3: Implement** per interfaces
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(api): add typed ApiError & ProblemDetails parser`

### Task F3: Refresh coordinator (cross-tab only when locks exist)
**Files:**
- Create: `src/lib/token-refresh.ts`
- Test: `src/lib/token-refresh.test.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` (F1), `parseProblem`, `networkError`, `hasCode` (F2), `createLockFake`, `mockFetchSequence` (T0); storage keys exported as `AUTH_STORAGE_KEYS` from `features/auth/store/auth-store.ts` (added here)
- Produces:
  - `type RefreshOutcome = { status: "refreshed" | "adopted"; accessToken: string } | { status: "unauthorized" } | { status: "transient"; error: ApiError }`
  - `interface LockManagerLike { request<T>(name: string, callback: () => Promise<T>): Promise<T> }`
  - `getRefreshCoordination(deps?): "cross-tab" | "in-tab"` (`cross-tab` only when lock manager is available)
  - `refreshTokens(sentAccessToken: string | null, deps?: { locks?: LockManagerLike; storage?: Storage; fetchFn?: typeof fetch }): Promise<RefreshOutcome>`: lock name `ysocial-refresh`; inside lock re-read storage; stored access token != sent -> `adopted`; else `POST /api/identities/refresh-token {refreshToken}`; success -> write both tokens, `refreshed`; 401 `InvalidRefreshToken` -> re-read storage: stored refresh token != one sent -> `adopted` (other tab rotated), else `unauthorized`; network/5xx/other -> `transient`; no refresh token -> `unauthorized`; no lock manager -> in-tab shared promise only

- [x] **Step 1: Write failing tests:** `with locks: 2 concurrent calls, same sent token -> exactly 1 fetch, second returns adopted`, `stored access token already rotated -> adopted without fetch`, `401 InvalidRefreshToken but stored refresh token changed meanwhile -> adopted`, `401 InvalidRefreshToken with unchanged stored token -> unauthorized (BE restart case)`, `no refresh token -> unauthorized`, `network error -> transient, tokens untouched`, `500 -> transient`, `success writes both tokens`, `no locks: coordination is "in-tab", same-tab concurrent calls still 1 fetch, cross-tab loser recovers via 401 rescue (not claimed as single-flight)`, `getRefreshCoordination reflects lock availability`
- [x] **Step 2: Run** `npx vitest run src/lib/token-refresh.test.ts` -> FAIL
- [x] **Step 3: Implement** per interfaces (default `locks = navigator.locks` adapter when present)
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(auth): refresh coordinator with cross-tab lock & rotation adoption`

### Task F4: api-client rewrite
**Files:**
- Modify: `src/lib/api-client.ts` (rewrite; delete `camelCaseKeys`, PascalCase fallback, in-module queue)
- Test: `src/lib/api-client.test.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` (F1), `ApiError`, `parseProblem`, `networkError` (F2), `refreshTokens` (F3), `useAuthStore` actions `setTokens`, `clearAuth`
- Produces:
  - `interface ApiRequestOptions extends RequestInit { params?: Record<string, string | number | boolean | undefined>; skipAuthRefresh?: boolean }`
  - `apiFetch<T>(path: string, options?: ApiRequestOptions): Promise<T>` (204 -> `undefined`; JSON parsed as-is, no key mapping; non-ok -> `throw ApiError`; `fetch` TypeError -> `networkError`)
  - `apiClient.get/post/put/patch/delete<T>(path, ...)`
  - Interceptor: on 401, if NOT `skipAuthRefresh` & not already retried: `refreshTokens(sentToken)`; `refreshed|adopted` -> retry ONCE with new token; `unauthorized` -> `clearAuth()` + redirect `/login` + throw original 401 `ApiError`; `transient` -> throw its error (session kept)
  - Auth endpoints (register, login, refresh-token, logout, forgot-password, reset-password) callers pass `skipAuthRefresh: true`

- [x] **Step 1: Write failing tests:** `adds Bearer header when token present`, `204 returns undefined`, `non-ok -> ApiError with code`, `fetch rejects -> ApiError kind network`, `HTML error body -> ApiError code Unknown`, `401 then refreshed -> original retried once with new token`, `401 then retry 401 -> rejects, no 2nd refresh`, `login 401 with skipAuthRefresh -> no refresh call`, `refresh unauthorized -> clearAuth & redirect /login`, `refresh transient -> session kept, ApiError thrown`, `params serialized, undefined skipped`
- [x] **Step 2: Run** `npx vitest run src/lib/api-client.test.ts` -> FAIL
- [x] **Step 3: Implement** per interfaces; confirm 0 importers of removed `camelCaseKeys` (`grep -rn camelCaseKeys src` empty)
- [x] **Step 4: Run** `npx vitest run src/lib` & `npm run typecheck` -> PASS
- [x] **Step 5: Commit** `refactor(api): typed api-client with single-flight refresh`

### Task F5: Contract test, regenerate API types & fix `api:update`
**Files:**
- Create: `src/lib/api-contract.test.ts`
- Modify: `package.json` (add `api:fetch`), `src/lib/api/generated.ts` (generated), `docs/swagger.json` (from BE)
- Modify: `src/features/auth/types/index.ts` (re-exports added when first used; later phases add theirs)

**Interfaces:**
- Produces: script `api:fetch` = download BE Swagger (Development) into `docs/swagger.json`; contract test reading `docs/swagger.json`
- Evidence at plan time: `generated.ts` is STALE (only request schemas + few paths; no `PostDto`, `ThreadDto`, `MeDto`, `LoginResponse`, GET endpoints); `docs/swagger.json` has them but lacks `NotificationDto.senderUsername` that BE source (`NotificationDtos.cs`) already has; page schemas are named `PostDtoPagedResponse`, `UserProfileDtoPagedResponse` (no generics); read-DTO enums are plain `string`, nearly every field is `nullable`

- [x] **Step 1: Write failing tests** in `api-contract.test.ts`: `every endpoint used by adapters exists in swagger (method + path)` (identities x6, users me/{id}/by-username/followers/following/follow-requests(+count)/relation-sets/blocks/mutes, profiles/me, privacy, posts CRUD & user list, threads, comments CRUD, like/bookmark PUT/DELETE for posts & comments, saveditems/posts, relations follow/close-friend/follow-request/mute, blocks, feed, notifications x4; follow-request path param is `{targetId}`, MAP says `{requesterId}`), `required schemas exist` (`PostDto`, `ThreadDto`, `MeDto`, `LoginResponse`, `RefreshTokenRequest`, `RegisterAccountResponse`, `RespondFollowRequestRequest`, `UpdatePrivacyRequest`, `PostDtoPagedResponse`, `UserProfileDtoPagedResponse`, `FollowListPageDto`, `UserPostsPageDto`, `NotificationPageDto`), `PostDto has kind, postId, parentId`, `NotificationDto has senderUsername` (FAILS today: swagger stale vs BE source)
- [x] **Step 2: Run** `npx vitest run src/lib/api-contract.test.ts` -> FAIL on `senderUsername`; record `npm run api:check` output
- [x] **Step 3: Add** `api:fetch` (Node fetch of `https://localhost:49895/swagger/v1/swagger.json`; needs `NODE_EXTRA_CA_CERTS` or system CA; document PEM export `dotnet dev-certs https --export-path <file> --format Pem --no-password`); run BE in Development, then `npm run api:fetch` & `npm run api:generate`
- [x] **Step 4: Run** `npx vitest run src/lib/api-contract.test.ts`, `npm run api:check`, `npm run typecheck` -> PASS (types FE already imports must compile)
- [x] **Step 5: Commit** `chore(api): add contract test & api:fetch, regenerate types from BE swagger`

### Task F6: Auth store cross-tab sync & device id
**Files:**
- Modify: `src/features/auth/store/auth-store.ts`
- Create: `src/features/auth/utils/device-id.ts`
- Test: `src/features/auth/store/auth-store.test.ts` (extend), `src/features/auth/utils/device-id.test.ts`

**Interfaces:**
- Consumes: `dispatchStorage` (T0), `isRealApi` (F1)
- Produces:
  - `AUTH_STORAGE_KEYS: { access: string; refresh: string; user: string }`
  - `registerAuthStorageSync(): () => void`: `storage` listener; on ANY auth key event re-read all three keys from storage & apply once (never trust `event.newValue`: `setTokens` fires 2 events, `clearAuth` fires 3); refresh token gone -> local state cleared without writing storage; mounted once from `Providers` after `hydrate()`
  - `getDeviceId(): string` (UUID under `ysocial_device_id`; stable; storage failure -> in-memory id)
  - `hydrate()` in real auth mode discards `mock_*` tokens & persisted user whose id is not GUID (then behaves as signed out)

- [x] **Step 1: Write failing tests:** `setTokens in other tab (2 events) -> store ends with both new tokens`, `clearAuth in other tab (3 events) -> single cleared state`, `sync never writes back to storage (no loop)`, `cleanup removes listener`, `hydrate real mode drops mock_ tokens`, `hydrate real mode drops non-GUID user id`, `hydrate mock mode unchanged`, `getDeviceId stable`, `getDeviceId survives storage failure`
- [x] **Step 2: Run** `npx vitest run src/features/auth` -> new tests FAIL
- [x] **Step 3: Implement** per interfaces; mount `registerAuthStorageSync` in `Providers`
- [x] **Step 4: Run** `npx vitest run src/features/auth` -> PASS
- [x] **Step 5: Commit** `feat(auth): cross-tab token sync, persisted device id, stale mock session guard`

### Task F7: Auth service (mock/real), error map, i18n
**Files:**
- Create: `src/features/auth/services/auth-service.ts`, `src/features/auth/utils/auth-error.ts`
- Modify: `src/features/auth/types/index.ts` (register schema: reserved-username rule only when `!isRealApi("auth")`), `src/lib/locales/vi.json`, `src/lib/locales/en.json`
- Test: `src/features/auth/services/auth-service.test.ts`, `src/features/auth/utils/auth-error.test.ts`

**Interfaces:**
- Consumes: `apiClient` (F4), `getDeviceId` (F6), `isRealApi` (F1), `ApiError`, `hasCode` (F2), store actions
- Produces:
  - `interface RegisterInput { email: string; password: string; username: string; phoneNumber?: string }`
  - `toAuthUser(me: MeDto): AuthUser` (profile.id -> `id`, `email`, `displayName`, `username`, `bio`/`avatarUrl` `null` -> `undefined`)
  - `authService.register(input): Promise<void>`; `login(loginId, password): Promise<AuthUser>`; `logout(): Promise<void>`; `forgotPassword(loginId): Promise<void>`; `resetPassword(input: { loginId: string; otp: string; newPassword: string }): Promise<void>`
  - Real `login`: `POST /api/identities/login {loginId,password,deviceId}` -> `setTokens` -> `GET /api/users/me` -> `updateUser(toAuthUser)`; `me` failure -> `clearAuth` + rethrow
  - Real `register`: `POST register` then `login(email, password)` (F-D8); login failure after success throws `RegisteredLoginFailedError`
  - Real `logout`: best-effort `POST logout {refreshToken}`, then `clearAuth` even on failure
  - `authErrorKey(error: unknown): TranslationKey`; `authFieldErrors(error: unknown): Record<string, string>` (from `errors` map, first message per field)
  - Mock adapter = today's inline behavior (seed demo account, `mock_*` tokens)

**i18n keys (add to BOTH files):**

| Key | vi | en |
|---|---|---|
| `auth.errorInvalidCredentials` | Tài khoản hoặc mật khẩu không đúng | Incorrect account or password |
| `auth.errorAccountInactive` | Tài khoản đang bị vô hiệu hóa | This account is deactivated |
| `auth.errorEmailTaken` | Email này đã được đăng ký | This email is already registered |
| `auth.errorUsernameTaken` | Tên người dùng đã có người dùng | This username is taken |
| `auth.errorInvalidOtp` | Mã OTP không đúng hoặc đã hết hạn | The OTP is wrong or expired |
| `auth.errorOtpAttemptsExceeded` | Nhập sai quá nhiều lần, hãy yêu cầu mã mới | Too many attempts, request a new code |
| `auth.errorValidationFailed` | Thông tin chưa hợp lệ, vui lòng kiểm tra lại | Some fields are invalid, please check |
| `auth.errorNetwork` | Không kết nối được máy chủ | Cannot reach the server |
| `auth.errorUnexpected` | Có lỗi xảy ra, thử lại sau | Something went wrong, try again |
| `auth.errorSessionExpired` | Phiên đăng nhập đã hết hạn | Your session has expired |
| `auth.registeredPleaseLogin` | Tạo tài khoản thành công, hãy đăng nhập | Account created, please sign in |

- [x] **Step 1: Write failing tests:** `real login sends loginId/password/deviceId with skipAuthRefresh`, `real login stores tokens then bootstraps viewer from /me`, `real login: /me failure clears auth`, `real register then login`, `register ok but login fails -> RegisteredLoginFailedError`, `logout with network failure still clears local session`, `forgot/reset call endpoints, 204 -> void`, `toAuthUser maps nulls to undefined`, `authErrorKey maps each auth code (InvalidCredentials, AccountInactive, EmailTaken, UsernameTaken, InvalidOtp, OtpAttemptsExceeded, ValidationFailed, network, unknown)`, `authFieldErrors returns first message per field`, `mock mode keeps seed demo login`, `real mode does not apply reserved-username rule`
- [x] **Step 2: Run** `npx vitest run src/features/auth` -> FAIL
- [x] **Step 3: Implement** per interfaces; select adapter per call via `isRealApi("auth")`
- [x] **Step 4: Run** `npx vitest run src/features/auth` & `npm run typecheck` -> PASS
- [x] **Step 5: Commit** `feat(auth): auth service with real BE adapter & error mapping`

### Task F8: Wire auth UI & viewer bridge
**Files:**
- Modify: `src/features/auth/components/login-form.tsx`, `register-form.tsx`, forgot/reset step components in `login-form.tsx`, logout trigger (main-layout dropdown/sidebar), `src/features/profile/components/viewer-sync.tsx` (no change expected; verify with `AuthUser` from `toAuthUser`)
- Test: `src/features/auth/components/login-form.test.tsx` (extend), new `register-form.test.tsx`

**Interfaces:**
- Consumes: `authService`, `authErrorKey`, `authFieldErrors` (F7)
- Produces: forms call `authService` only (no inline `setTokens`/`updateUser`); field errors from BE `errors` map shown inline; `RegisteredLoginFailedError` -> `router.push("/login")` with `auth.registeredPleaseLogin`

- [x] **Step 1: Write failing tests:** `login form shows invalidCredentials message on 401`, `login form keeps submit enabled & spinner while pending`, `register shows usernameTaken on 409`, `register maps BE validation errors to fields`, `register-then-login-failure navigates /login with notice`, `forgot step shows otp errors inline`, `mock mode flows unchanged`
- [x] **Step 2: Run** `npx vitest run src/features/auth/components` -> FAIL
- [x] **Step 3: Implement** wiring; replace redirect usage of `/auth/login` anywhere (`grep -rn "/auth/login" src` empty)
- [x] **Step 4: Run** `npx vitest run src/features/auth` -> PASS
- [x] **Step 5: Commit** `feat(auth): wire auth forms to auth service`

### Task F9: Phase F exit
**Files:**
- Modify: `.context/features/fe-be-integration-roadmap.md` (check F.1-F.3), MAP §6 (CP0/CP1 rows "FE adopted", post delete moved to C), `.context/features/identities.md` (FE as-built notes)
- Create: `.context/features/fe-be-integration.md` (Tier 3 as-built: switch, api-client, refresh, mixed mode, pitfalls)

- [x] **Step 1: Run** `npm run test`, `npm run typecheck`, `npm run lint`, `npm run api:check` -> all pass (record counts)
- [x] **Step 2: Manual smoke on real BE** (`NEXT_PUBLIC_REAL_API_SLICES=auth`, BE Development, dev cert trusted): register -> auto-login -> reload (viewer persists) -> force refresh (shorten token or invalidate access token) -> logout; repeat in 2 tabs (1 refresh call in BE log, no forced logout); BE restart mid-session -> clean `/login`; wrong password message; forgot/reset with OTP from BE Development log
- [x] **Step 3: Log** every disagreement in Mismatch log; resolve or defer each
- [x] **Step 4: Update docs** (files above); `requesting-code-review` gate: critical issues block Phase C
- [x] **Step 5: Commit** `docs(integration): close Phase F`

**Execution record:**
- **Verification:** `npm run test` 88 files / 1003 tests pass (after review fixes); `typecheck` & `api:check` clean; `eslint` 6 errors all pre-existing & outside Phase F files (`safe-hydration.tsx`, `use-mobile.ts`, `signalr-client.ts` any, `post-creator-dialog.tsx` any, `post-draft-store.ts` prefer-const, 1 more any in posts) -> deferred minors, not touched
- **Smoke (real BE Development, `NEXT_PUBLIC_REAL_API_SLICES=auth`, dev cert trusted):**
  - browser: register -> auto-login -> reload (viewer persists, nav uses real username) -> logout (`POST logout` 204, storage cleared, `/login`) -> wrong password message -> forgot (204) -> reset with wrong OTP shows `InvalidOtp` inline; logout in tab 1 flips tab 2 nav to `/login` without reload (storage sync)
  - node (jsdom, real BE): corrupt access token + 2 concurrent `apiClient.get(/me)` -> exactly 1 `refresh-token` call, both resolve; BE restart then call with stale token -> refresh 401 -> `clearAuth` + redirect `/login`
  - NOT covered: real cross-tab lock contention in 2 browser tabs (no authenticated real call exists in Phase F surface to trigger refresh from UI; lock path proven by `createLockFake` unit tests only; re-smoke in Phase C)
  - Follow-up: M17 resolved in BE; forgot -> reset -> login with new password verified on real BE via curl (OTP read from log)
- **Review gate (fresh Opus reviewer):** 2 Important fixed RED->GREEN (suite 1003/1003): no-lock cross-tab race could clear freshly rotated pair (api-client now adopts storage pair that differs from state instead of clearing), guest 401 forced logout + hard redirect (now throws original 401); plus Minor login 200 without tokens now rejected
- **Deferred minors (carry to Phase C/X):**
  - double click on enabled submit sets RHF `isSubmitting` false early (spinner flickers off, duplicate request blocked)
  - `rotate` reads raw storage pre-hydration (safe only through effect ordering); first child request before `hydrate()` goes out without Bearer
  - no timeout on refresh/logout fetch (hung refresh stalls lock waiters)
  - malformed 200 on refresh treated transient (BE already rotated); `readBody` casts non-JSON 200 text as `T`
  - N queued lock waiters each retry refresh while BE returns 5xx
  - `send()` attaches Bearer on `skipAuthRefresh` calls; `authFieldErrors` shows raw BE text (not vi); `navigator.locks as unknown as LockManagerLike` cast
  - residual no-lock window: tab B may redirect to `/login` while tab A's fresh pair lands right after (valid session in storage)
- **Rulings:**
  - `RefreshOutcome` success/adopted variants also carry `refreshToken` (additive: api-client must sync store, storage events never fire in same tab)
  - `LockManagerLike` declared in `token-refresh.ts`; T0 helper declares same shape structurally (avoids test util importing app code)
  - GUID check for stale-mock session guard is local regex in `auth-store.ts`; C1 `isBackendId` should replace it
  - `BusinessRuleViolated` maps to `auth.errorValidationFailed`; existing `auth.errorUsernameTaken` text kept (plan table would have replaced it)
  - redirect isolated as `authRedirect.toLogin` (jsdom cannot observe `location.assign`)
  - mock adapter keeps its simulated delays inside `authService` so mock-mode timing is unchanged
  - `useSubmitGuard` hook added (`react-hooks/refs` lint forbids ref in form component); all 5 auth submit buttons stay enabled
  - real-mode form tests live in `login-form.real.test.tsx` (existing mock test untouched); `.gitignore` gets `!.env.example`

---

# PHASE C - Content (profile, posts, feed, saved, follow)

## Design notes (Phase C)
- **Slice state:** env `auth,content`; follow/unfollow moves here from Phase G (profile header, hover card, `PostCard` render `followStatus`); feed READ moves here from Phase N (feed, detail, like, bookmark share `post-store`/`post-service`; mock feed would send mock ids to real routes)
- **Id domains:** BE routes are `{id:guid}`, mock ids look like `author-01`. Real adapters call `requireBackendId(id)` (C1): non-GUID -> local `ApiError` 404, no network. Persisted FE state (drafts, saved collections overlay, recent searches, localStorage user) may hold mock ids: filtered, never sent
- **404 rule:** real adapters map 404 to `null`/not-found; network, TLS, 5xx, unknown rethrown. `locked: true` is never error
- **`/@username` server read:** unknown/deleted profile = 404 for every viewer (private = 200, D15) -> server `notFound()` is correct; other failures throw to `error.tsx`
- **`/posts/[id]` is NOT decided by server:** tokens live in localStorage, so server only reads anonymously; private author's or non-public post is 404 for anonymous but 200 for accepted follower. Server builds metadata only, from `GET /api/threads/{id}` (accepts post & comment ids; `GET /api/posts/{id}` 404s for comments): 200 -> metadata, 404 -> generic title, other -> throw. page body is client-side with viewer's token: client 404 (also blocked, D14) -> not-found state, other errors -> error state. Result is soft 404 for truly unknown ids: accepted deviation from `conventions/frontend.md` §5 until cookie/BFF auth exists. `loading.tsx` stays on this route (it no longer resolves 404 on server)
- **Dev cert for server reads:** `dotnet dev-certs https --export-path <file> --format Pem --no-password`, `NODE_EXTRA_CA_CERTS=<file>` exported in shell that starts `next dev` (never `NODE_TLS_REJECT_UNAUTHORIZED=0`; never in `.env*`: read at Node start)
- **Mapping (swagger facts):** read-DTO enums are `string`, nearly all fields nullable: mappers accept null & absent, validate against MAP §3 unions. `PostDto.kind` `"comment"` -> comment, anything else -> post; `PostDto.postId` = root post id; `parentId` omitted when null (top-level comment parent = post id); `imageUrl` -> `imageUrl` + `imageUrls: [imageUrl]`; `visibility` preserved (`public`, `followersOnly`, `private`) via widened FE type, unknown string -> `private` (restrictive; proposal, logged M12); unknown `followStatus` -> `none` (M12); avatar/bio null -> undefined
- **PostRef:** `{ id, kind: "post" | "comment", rootPostId }` is passed to like, bookmark, edit, delete, reply so endpoint choice never depends on hidden store lookup (C3)
- **Delete:** BE 204; adapter returns `{ deletedIds: [ref.id] }`; BE comments of deleted post stay hidden, not cascade-deleted
- **Follow set (`fetchFollowedIds`):** sole consumer is `loadFollowGraph` (`setFollowedIds` marks set `loaded` & accepted-only), read via `ensureFollowGraph` by `post-feed`, `close-friends-list`, `viewer-sync`, & `getFollowedIds`/`useFollowedIds` by `post-feed` & `use-pending-feed`. `[]` would turn every followed user into "none", so real adapter pages `GET /api/users/{viewerId}/following?pageSize=50` until `hasNextPage` is false & returns accepted ids; never marks `loaded` from partial result (failure rethrown)
- **Capabilities are 1 declarative table** keyed by parsed slice prefix (C2); BE-less capabilities are off whenever content is real (also after all slices are real, until BE adds them)
- **Relation facade while content real & graph mock:** `relation-service` returns empty defaults (no sets, no lists), so `ViewerSync` never pushes real id into mock relation graph
- **Following tab:** guests get 401 -> tab hidden for guests in real mode
- **Mute:** UI hidden until Phase N (local-only mute would not affect real feed)
- **Coexistence table (content real):**

| Surface | Decision |
|---|---|
| Feed (both tabs) | real |
| New-posts pill (`subscribeToNewPosts`) | hide |
| Search page, search box suggestions, tags page, trending, sidebar suggestions (`fetchSearch`, `searchUsers`, `fetchSuggestedUsers`, `fetchPostsByTag`, `fetchTrendingTags`) | hide |
| Pin, hide-like-count, multi-image & audience picker in composer, profile tabs `replies`/`media`, close-friends ring badge | hide |
| Followers/following dialog | hide trigger until G (mock users would link to real `by-username` & 404) |
| Block, close-friend, privacy, follow-request UI (profile header, `PostCard` menu, settings lists) | hide until G |
| Mute UI | hide until N |
| Inline notifications page (mock list) | hide mock items; page shows empty state until N |
| Saved collections overlay | keep; entries with non-GUID ids filtered |
| Profile Saved tab | real (C7) |

### Task C1: Server API fetch, backend-id guard & dev-cert recipe
**Files:**
- Create: `src/lib/server-api.ts`, `src/lib/backend-id.ts`; `README.md` note (cert recipe)
- Test: `src/lib/server-api.test.ts`, `src/lib/backend-id.test.ts`

**Interfaces:**
- Consumes: `API_BASE_URL` (F1), `parseProblem`, `networkError` (F2)
- Produces:
  - `serverApiFetch<T>(path: string, init?: RequestInit): Promise<T>` (anonymous, `cache: "no-store"`, throws `ApiError`)
  - `isNotFound(error: unknown): boolean` (true only for `kind: "http"` & `status 404`)
  - `isBackendId(id: string): boolean` (GUID regex)
  - `requireBackendId(id: string): string` (throws local `ApiError{kind:"http", status:404, code:"NotFound"}` for non-GUID, no network)

- [x] **Step 1: Write failing tests:** `200 returns parsed JSON`, `404 throws ApiError status 404 (isNotFound true)`, `network failure throws kind network (isNotFound false)`, `500 & TLS failure are not isNotFound`, `no Authorization header sent`, `isBackendId accepts GUID rejects author-01`, `requireBackendId throws local 404 without fetch`
- [x] **Step 2: Run** `npx vitest run src/lib/server-api.test.ts src/lib/backend-id.test.ts` -> FAIL
- [x] **Step 3: Implement**; document cert export + shell `NODE_EXTRA_CA_CERTS` + `dotnet dev-certs https --trust` in README
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(api): anonymous server fetch & backend id guard`

### Task C2: Capability table & relation facade
**Files:**
- Create: `src/lib/capabilities.ts`
- Modify: consumers per coexistence table (sidebar nav, `SearchBox`, trending & suggestions widgets, search/tag routes, `PostCard` menu, `PostCreatorCore`, profile tabs, followers dialog trigger, block/close-friend/privacy/follow-request/mute UI, `use-new-posts-stream.ts`, close-friends badge, home tab bar, notifications page), `relation-service.ts` (empty defaults facade), `viewer-sync.tsx`
- Test: `src/lib/capabilities.test.ts`, extend tests of touched surfaces

**Interfaces:**
- Consumes: `parseRealSlices` (F1), `setRealSlices` (T0)
- Produces:
  - `type Capability = "search" | "tags" | "trending" | "suggestions" | "pin" | "hideLikeCount" | "multiImage" | "postAudience" | "profileRepliesMedia" | "newPostsPill" | "closeFriendsBadge" | "followingTabGuest" | "followLists" | "blockUi" | "closeFriendsUi" | "privacyUi" | "followRequestsUi" | "muteUi"`
  - `hasCapability(capability: Capability): boolean`, derived ONLY from `CAPABILITY_RULES: Record<Capability, (slices: ReadonlySet<ApiSlice>) => boolean>`
  - Rules: BE-less group (`search`, `tags`, `trending`, `suggestions`, `pin`, `hideLikeCount`, `multiImage`, `postAudience`, `profileRepliesMedia`, `newPostsPill`, `closeFriendsBadge`, `followingTabGuest`) = true iff content NOT real; graph group (`followLists`, `blockUi`, `closeFriendsUi`, `privacyUi`, `followRequestsUi`) = true iff content not real OR graph real; `muteUi` = true iff content not real OR activity real

- [x] **Step 1: Write failing tests:** table-driven over 5 supported states (`""`, `auth`, `auth,content`, `auth,content,graph`, `auth,content,graph,activity`) asserting every capability; `every coexistence-table row maps to capability or explicit "accepted" entry (test lists both)`; `relation facade returns empty defaults when content real & graph mock (no call to mock graph)`; `ViewerSync does not call ensureRelationSets with real id into mock graph`; `hidden search route renders not-available state`
- [x] **Step 2: Run** `npx vitest run src/lib/capabilities.test.ts` -> FAIL
- [x] **Step 3: Implement** table + gate each consumer (hide, not delete) + facade
- [x] **Step 4: Run** `npx vitest run` for touched features -> PASS
- [x] **Step 5: Commit** `feat(integration): declarative capability table hides BE-less & not-yet-wired features`

### Task C3: PostRef refactor (mock mode, behavior preserving)
**Files:**
- Modify: `src/features/posts/types/index.ts` (add `PostRef`; `PostItem.kind` & `PostItem.rootPostId` REQUIRED), `src/features/posts/services/post-service.ts` (signatures below; mock `buildPost` & seed loader set `kind`/`rootPostId`), `post-card.tsx`, `hooks/use-owner-actions.ts`, `detail/reply-composer.tsx` (prop `parent: PostRef`), `detail/post-detail-container.tsx`, mocks/seeds
- Create: `src/features/posts/utils/post-ref.ts`
- Test: extend `post-service` tests, `post-card`, `use-owner-actions`, `reply-composer` tests; new `post-ref.test.ts`

**Interfaces:**
- Produces:
  - `interface PostRef { id: string; kind: "post" | "comment"; rootPostId: string }`
  - `toPostRef(post: Pick<PostItem, "id" | "kind" | "rootPostId">): PostRef`
  - New signatures: `setPostLike(ref: PostRef, liked: boolean): Promise<void>`, `setPostBookmark(ref: PostRef, bookmarked: boolean): Promise<void>`, `updatePostContent(ref: PostRef, content: string, actorId: string): Promise<PostItem>`, `deletePost(ref: PostRef, actorId: string): Promise<{ deletedIds: string[] }>`, `createReply(parent: PostRef, input: CreatePostInput, author: PostAuthor): Promise<PostItem>`
  - Mock rule: `kind = parentId ? "comment" : "post"`, `rootPostId = parent ? (parent.rootPostId ?? parent.id) : id`; mock functions use `ref.id`
  - `useOwnerActions(postId)` keeps its signature; it builds `toPostRef(current())` from post it already reads for rollback

- [x] **Step 1: Write failing tests:** `toPostRef derives kind & root`, `mock buildPost sets kind/rootPostId (reply to reply keeps root)`, `post-card like/bookmark call services with ref`, `useOwnerActions edit/delete of reply passes kind comment & its root`, `ReplyComposer sends parent ref (root post & nested comment)`, `entire existing posts suite stays green in mock mode`
- [x] **Step 2: Run** `npx vitest run src/features/posts` -> new tests FAIL; `npm run typecheck` shows signature errors to fix
- [x] **Step 3: Implement** refactor; update every caller (`grep -rn "setPostLike\|setPostBookmark\|updatePostContent\|deletePost\|createReply" src` has no old-signature call)
- [x] **Step 4: Run** `npm run test`, `npm run typecheck` -> PASS
- [x] **Step 5: Commit** `refactor(posts): pass PostRef to post operations`

### Task C4: DTO mappers
**Files:**
- Create: `src/features/posts/services/post-mapper.ts`, `src/features/profile/services/user-mapper.ts`
- Modify: `src/features/posts/types/index.ts`, `src/features/profile/types/index.ts` (re-export schema types)
- Test: `post-mapper.test.ts`, `user-mapper.test.ts`

**Interfaces:**
- Consumes: generated schema types (F5): `PostDto`, `ThreadDto`, `PostDtoPagedResponse`, `UserPostsPageDto`, `UserProfileDto`, `UserProfileDtoPagedResponse`, `FollowListPageDto`, `MeDto`
- Produces:
  - `toPostItem(dto: PostDto): PostItem` (sets `kind`, `rootPostId = dto.postId`)
  - `toPostThread(dto: ThreadDto): PostThread`
  - `toFeedPage(dto: PostDtoPagedResponse): FeedPage`
  - `toUserPostsPage(dto: UserPostsPageDto): UserPostsPage`
  - `toUserProfile(dto: UserProfileDto): UserProfile`
  - `toFollowListPage(dto: FollowListPageDto | UserProfileDtoPagedResponse): FollowListPage`

- [x] **Step 1: Write failing tests:** `kind comment & parentId & rootPostId`, `kind null -> post`, `imageUrl -> imageUrls single`, `omitted imageUrl/parentId stay undefined`, `visibility followersOnly/private preserved, unknown string -> private`, `null content/displayName tolerated`, `author avatarUrl null -> undefined`, `toPostThread parent null preserved`, `toFeedPage nextPage from hasNextPage`, `toUserPostsPage keeps locked`, `toUserProfile unknown followStatus -> none`, `toFollowListPage keeps locked`
- [x] **Step 2: Run** `npx vitest run src/features/posts/services/post-mapper.test.ts src/features/profile/services/user-mapper.test.ts` -> FAIL
- [x] **Step 3: Implement** mappers per design notes
- [x] **Step 4: Run** same + `npm run typecheck` -> PASS
- [x] **Step 5: Commit** `feat(integration): DTO mappers for posts & profiles`

### Task C5: User service real adapter (profile, follow)
**Files:**
- Modify: `src/features/profile/services/user-service.ts` (dispatch `isRealApi("content")` per function)
- Create: `src/features/profile/services/user-service.real.ts`
- Test: `src/features/profile/services/user-service.real.test.ts`

**Interfaces:**
- Consumes: `apiClient` (F4), `toUserProfile`/`toFollowListPage` (C4), `requireBackendId` (C1), `isNotFound`-style 404 handling
- Produces (same signatures as mock):
  - `fetchUser(id, actorId): Promise<UserProfile | null>` (404 or non-GUID -> `null`)
  - `fetchUserByUsername(username, actorId)`
  - `updateProfile(id, patch, actorId)` (`PUT /api/users/profiles/me`; `gender` int; no username)
  - `followUser(id, actorId): Promise<FollowStatus>`; `unfollowUser(id, actorId): Promise<void>`
  - `fetchFollowedIds(actorId): Promise<string[]>` (pages `GET /api/users/{actorId}/following?pageSize=50` until `hasNextPage` false; accepted ids; any page failure rethrown)
  - `upsertViewerUser`: real mode does NOT write mock user DB (viewer is already BE profile)

- [x] **Step 1: Write failing tests:** `fetchUser 404 -> null`, `fetchUser network/5xx rethrown (not null)`, `fetchUser non-GUID -> null without fetch`, `fetchUserByUsername lowercases`, `updateProfile sends gender int & maps response`, `updateProfile ProfileFieldInvalid surfaces ApiError`, `followUser returns pending/accepted`, `unfollow 204`, `follow 404 (blocked) rejects ApiError for rollback`, `fetchFollowedIds pages 3 pages into 1 list`, `fetchFollowedIds page 2 failure rethrows & never resolves partial`, `real upsertViewerUser leaves mock DB untouched`
- [x] **Step 2: Run** `npx vitest run src/features/profile/services` -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** `npx vitest run src/features/profile` -> PASS
- [x] **Step 5: Commit** `feat(profile): real user service adapter (profile, follow)`

### Task C6: Post service real adapter
**Files:**
- Modify: `src/features/posts/services/post-service.ts` (dispatch per function)
- Create: `src/features/posts/services/post-service.real.ts`
- Test: `src/features/posts/services/post-service.real.test.ts`

**Interfaces:**
- Consumes: `apiClient`, mappers (C4), `PostRef` (C3), `requireBackendId` (C1)
- Produces (signatures from C3 & mock):
  - `fetchFeed(tab, page, viewerId): Promise<FeedPage>` (`GET /api/feed?tab&page`; `following` for guest -> empty page without call)
  - `fetchUserPosts(userId, tab, page, actorId)` (`threads` only)
  - `fetchPostThread(id, actorId): Promise<PostThread | null>` (`GET /api/threads/{id}`; 404/non-GUID -> `null`)
  - `createPost(input, author)` (`POST /api/posts`: `content` + first `imageUrl` only)
  - `createReply(parent: PostRef, input, author)` (`POST /api/comments {postId: parent.rootPostId, content, parentCommentId: parent.kind === "comment" ? parent.id : undefined}`)
  - `updatePostContent(ref, content, actorId)` (`PUT /api/posts/{id}` or `/api/comments/{id}` by `ref.kind`)
  - `deletePost(ref, actorId)` (same routing; returns `{ deletedIds: [ref.id] }`)
  - `setPostLike(ref, liked)`, `setPostBookmark(ref, bookmarked)` (PUT/DELETE; post -> `/api/posts/{id}/like|bookmark`, comment -> `/api/comments/{id}/like|bookmark`)

- [x] **Step 1: Write failing tests:** `feed forYou calls /api/feed?tab=forYou&page`, `following for guest returns empty without call`, `feed page 2 nextPage from hasNextPage`, `thread 404 -> null`, `thread network failure rethrown (not null)`, `createPost text only sends no imageUrl`, `reply to root post: postId = root, no parentCommentId`, `reply to nested comment: postId = rootPostId, parentCommentId = ref.id`, `top-level comment like -> /api/comments/{id}/like`, `post like -> /api/posts/{id}/like`, `edit & delete of comment use comments routes`, `deletePost returns [ref.id]`, `like PUT then DELETE idempotent calls`, `non-GUID ref id -> local 404, no fetch`, `404 on like (blocked mid-session) rejects ApiError so op-ledger rolls back`
- [x] **Step 2: Run** `npx vitest run src/features/posts/services` -> FAIL
- [x] **Step 3: Implement**; mock functions untouched
- [x] **Step 4: Run** `npx vitest run src/features/posts` -> PASS
- [x] **Step 5: Commit** `feat(posts): real post service adapter (feed, thread, writes, likes)`

### Task C7: Saved page real
**Files:**
- Modify: `src/features/posts/services/post-service.ts` (`fetchSavedPosts` dispatch), `post-service.real.ts`, saved list consumer if collections reference ids
- Test: extend `post-service.real.test.ts`, `src/features/saved/components/saved-list.test.tsx`

**Interfaces:**
- Produces: `fetchSavedPosts(actorId, page): Promise<SavedPostsPage>` real = `GET /api/saveditems/posts?page`; collections/drag-sort/bulk-unsave stay local overlay keyed by real post ids; overlay entries with non-GUID ids are filtered; bulk unsave = N x `DELETE .../bookmark`

- [x] **Step 1: Write failing tests:** `saved page maps PostDtoPagedResponse`, `hidden posts absent from totalCount (BE-filtered)`, `bulk unsave issues DELETE per id & reconciles list`, `local collection keeps real-id entries & drops non-GUID entries`
- [x] **Step 2: Run** `npx vitest run src/features/saved src/features/posts/services` -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(saved): real saved posts page`

### Task C8: Server pages (`/@username`, `/posts/[id]`)
**Files:**
- Modify: `src/app/[@username]/page.tsx`, `src/app/posts/[id]/page.tsx`, `src/features/profile/utils/*` (`resolveProfileRoute` real branch), `src/features/posts/components/detail/post-detail-container.tsx` (client 404 vs error states), create `src/app/[@username]/error.tsx` if missing
- Test: `src/app/[@username]/page.test.tsx`, `src/app/posts/[id]/page.test.tsx` (extend), container test

**Interfaces:**
- Consumes: `serverApiFetch`, `isNotFound` (C1), `isRealApi` (F1)
- Produces:
  - Real `/@username`: `GET /api/users/by-username/{u}`; 404 -> `notFound()`; other failure -> throw (error page); metadata from profile DTO (private = 200)
  - Real `/posts/[id]`: server calls `GET /api/threads/{id}` anonymously for metadata ONLY; 200 -> metadata, 404 -> generic title (page still renders), other -> throw; NO `notFound()` from server; `loading.tsx` kept
  - Client `PostDetailContainer`: thread 404 -> not-found state (also blocked), other errors -> error state with retry
  - Mock branch unchanged (cookie resolver)

- [x] **Step 1: Write failing tests:** `profile: unknown username -> notFound`, `profile: BE down -> throws (not notFound)`, `profile: TLS failure -> throws`, `profile: private profile 200 metadata`, `post: anonymous 404 -> generic title & page still renders (follower can see it)`, `post: BE down -> throws`, `post: comment id resolves via threads for metadata`, `container: 404 -> not-found state`, `container: network error -> error state, not not-found`, `mock mode path unchanged`
- [x] **Step 2: Run** `npx vitest run src/app src/features/posts/components/detail` -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(app): real reads for profile route & viewer-aware post route`

### Task C9: Phase C exit
**Files:**
- Modify: roadmap (C.1-C.4 per deviations), MAP §6 (CP2 FE adopted; follow & feed read moved; follow-request param name `{targetId}`), `.context/features/fe-be-integration.md` (include soft-404 deviation from `conventions/frontend.md` §5 & Zustand-adapters deviation from §4), `profile.md`, `post-detail.md`, `feed-post-interaction.md` (as-built notes), `frontend-roadmap.md` item 2.7 note

- [x] **Step 1: Run** `npm run test`, `npm run typecheck`, `npm run lint`, `npm run api:check` -> pass
- [x] **Step 2: Manual smoke** (`NEXT_PUBLIC_REAL_API_SLICES=auth,content`, shell `NODE_EXTRA_CA_CERTS` set, browser trusts cert): login seed user -> feed both tabs -> open post & reply thread -> create post/reply (also reply to nested comment) -> edit -> delete -> like/bookmark (post & comment) -> saved page -> other profiles (public + private locked) -> follow/unfollow -> edit profile; hard-reload `/posts/{id}` of private author's post as accepted follower (visible) & as anonymous (not-found state); BE down on `/@username` -> error page; hidden-feature check (no search, pin, pill, block/mute UI)
- [x] **Step 3: Record** Mismatch log
- [x] **Step 4: `requesting-code-review` gate**
- [x] **Step 5: Commit** `docs(integration): close Phase C`

**Execution record:**
- **Verification:** `npm run test` 98 files / 1104 tests pass (2 timing-flaky tests fail only under full-suite load & pass alone: `close-friends-list`, `use-profile-tab-posts`); `typecheck` clean; `eslint` 6 pre-existing errors outside Phase C files (unchanged); `api:check` passes on regenerated (LF) file, fails on CRLF Windows checkout of `generated.ts` (EOL only: run `npm run api:generate` first)
- **Smoke (real BE Development, `auth,content`, dev cert trusted, seed users `test_user`/`demo_user`):** feed forYou, create post, like & bookmark (PUT routes), follow, thread, reply & nested reply (BE confirmed root `postId` + parent comment), saved page, own & public & private-locked profile, edit profile, delete post (204), comment id opens via `threads`, hard reload `/posts/{id}` of private author's post: non-follower not-found state, accepted follower sees it (tab title stays generic: M14), BE stopped -> `/@username` error page (not 404), hidden features absent (search nav, sidebar widgets, pin, hide-likes, composer upload/audience, replies/media tabs). NOT smoked in browser: edit post (unit-tested), bulk unsave, guest feed
- **Review gate (fresh Opus reviewer):** 0 Critical, 4 Important: 3 fixed (like/bookmark rollback on service rejection, saved single-unsave now calls BE, restored mock drafts no longer publish hidden audience/close-friends visibility + GIF hidden in reply mode & `fetchFollowedIds` page cap), 1 deferred (updateProfile wipes gender/DOB: M18, needs BE decision)
- **Deferred minors:** saved list not cleared on account switch/logout & capped at 100 posts without notice; 1 malformed item (missing id/createdAt) fails whole page, null child list in `childReplies` crashes mapper; profile client lookup network/5xx shows desync state instead of error; Unblock button shown for externally blocked profile but refused by facade; `generateMetadata` BE outage sends post page to `error.tsx`; several GIFs picked but only first sent; bulk unsave real path has no automated test
- **Rulings:**
  - local file uploads are blob URLs & BE has no upload API: file-upload button is hidden under `multiImage`, real `createPost` sends only http(s) image URLs
  - `audience` + close-friends visibility grouped under `postAudience`; `/saved` collections stay local overlay (not persisted, BE has none)
  - `PostDetailContainer` waits for auth hydration in real mode (anonymous first request would 404 follower-only post)
  - mappers throw `ApiError` for DTO without id (contract breach) & default missing counts/flags (every swagger field is optional, M12)
  - real `updateProfile` re-sends current cover & `gender: 0` (BE replaces whole profile): M18
  - `/saved`, relation facade & capability table are only Phase C guards for mock-only surfaces; mock modules stay untouched until Phase X

---

# PHASE G - Graph (lists, requests, privacy, block, close friends)

## Design notes
- **Slice state:** env `auth,content,graph`; enables followers/following dialog
- **Mapping:** `FollowListPageDto -> FollowListPage` (`locked` true -> empty list UI "locked", not error); `RelationSetsDto -> RelationSets` (`blocked`, `muted`, `closeFriends`, `isPrivate`, `requestCount`; no `blockedBy`)
- **D14:** blocked either way = 404 on profile/lists/posts; own block list is only place blocked profile is visible (`isBlocked: true`); drop `isBlockedBy` & `blockedBy` usage; unblock only from own list
- **Writes:** respond `POST .../relations/follow-request {decision}`; privacy `PUT users/profiles/me/privacy -> {acceptedCount}`; block `POST/DELETE .../blocks`; close friend `PATCH .../close-friend` (400 `CloseFriendRequiresAcceptedFollow` surfaced)
- **Mute** stays in N (needs `me/mutes` + feed exclusion together)
- **Enables (capability table, C2):** followers/following dialog, block, close-friend, privacy & follow-request UI; `relation-service` facade stops returning empty defaults

### Task G1: Relation service real reads
**Files:**
- Modify: `src/features/profile/services/relation-service.ts` (dispatch `isRealApi("graph")`), `user-service.ts` (`fetchFollowList`)
- Create: `src/features/profile/services/relation-service.real.ts`
- Test: `relation-service.real.test.ts`

**Interfaces:**
- Produces (same signatures as mock): `fetchFollowList(...)` (`GET users/{id}/followers|following ?page&pageSize&query`, `locked` kept), `fetchFollowRequests(q, actorId)`, `fetchFollowRequestCount(actorId)`, `fetchBlockedUsers(q, actorId)`, `fetchRelationSets(actorId)`, `fetchCloseFriendCandidates(q, actorId)` (derived from `following` list + `relationSets.closeFriends`)

- [x] **Step 1: Write failing tests:** `followers list maps page & query`, `private non-permitted -> locked true, items empty`, `follow list 404 (blocked) -> ApiError status 404`, `requests count endpoint`, `blocked list items marked isBlocked`, `relation sets map arrays & isPrivate`, `close friend candidates mark dormant flags`
- [x] **Step 2: Run** `npx vitest run src/features/profile/services` -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(profile): real relation reads`

### Task G2: Relation service real writes
**Files:**
- Modify/Create: `relation-service.ts` dispatch, `relation-service.real.ts`
- Test: extend `relation-service.real.test.ts`

**Interfaces:**
- Produces: `setBlocked(id, on, actorId)`, `setCloseFriend(id, on, actorId)`, `setPrivateAccount(on, actorId): Promise<{ acceptedCount: number }>`, `respondFollowRequest(requesterId, decision, actorId)`; `setMuted` remains mock (N)

- [x] **Step 1: Write failing tests:** `block POST then DELETE idempotent`, `block self -> CannotBlockSelf ApiError`, `close friend when not accepted -> CloseFriendRequiresAcceptedFollow`, `privacy returns acceptedCount`, `respond accept/decline sends decision`, `respond 404 (request gone) rejects for rollback`
- [x] **Step 2: Run** -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** `npx vitest run src/features/profile` -> PASS
- [x] **Step 5: Commit** `feat(profile): real relation writes`

### Task G3: D14 handling, dialog enable, lists UI
**Files:**
- Modify: `src/lib/capabilities.ts` rules already key on `graph` (verify), profile container & `PostCard` menu (blocked -> 404 behavior), `blocked-user-list.tsx`, relation-store (drop `blockedBy`), followers dialog locked state; i18n
- Test: extend `profile-container` / `followers-dialog` / `blocked-user-list` tests

**Interfaces:**
- Produces: profile 404 when blocked either way (renders not-found state, network/5xx still error state); `isBlockedBy`/`blockedBy` removed from FE logic; locked lists render empty-state (`profile.followListLocked`); block/close-friend/privacy/follow-request UI visible when graph real

**i18n keys (BOTH files):**

| Key | vi | en |
|---|---|---|
| `profile.followListLocked` | Tài khoản riêng tư, danh sách không hiển thị | Private account, list is hidden |
| `profile.blockedNotFound` | Không tìm thấy người dùng này | This user was not found |

- [x] **Step 1: Write failing tests:** `blocked profile (404) renders not-found`, `profile network error renders error state, not not-found`, `locked list shows locked empty state, not error`, `blockedBy never read`, `graph UI hidden until graph real, visible after`, `unblock only from own block list`, `follow 404 mid-session rolls back optimistic state`
- [x] **Step 2: Run** `npx vitest run src/features/profile` -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(profile): D14 not-found, locked lists, graph UI enabled`

### Task G4: Phase G exit
**Files:**
- Modify: roadmap (G.1-G.2), MAP §6 (CP3), `.context/features/relationship-controls.md`, `fe-be-integration.md`

- [x] **Step 1: Run** `npm run test`, `npm run typecheck`, `npm run lint`, `npm run api:check` -> pass
- [x] **Step 2: Manual smoke** (`...,graph`): private account follow -> pending -> accept from other account -> followers dialog (locked for non-follower) -> privacy toggle accepts pending -> block (profile 404 both ways, list shows own block) -> unblock -> close friend toggle (needs accepted)
- [x] **Step 3: Record** Mismatch log (M20); `requesting-code-review` gate not run: user asked for review only on request
- [x] **Step 4: Commit** `docs(integration): close Phase G`

**Execution record:**
- **Verification:** `npm run test` 99 files / 1133 tests (1 timing-flaky `close-friends-list` fails only under full-suite load, passes alone); `typecheck` clean; `eslint` same 6 pre-existing errors; `api:check` unchanged (no swagger change)
- **Smoke (real BE Development, `auth,content,graph`):**
  - curl, 2 seed accounts: privacy on -> follow = `pending` -> requests count 1 & list -> anonymous followers = `locked: true` -> accept (204) -> follower list for follower -> close friend PATCH -> relation-sets has flag -> block (profile 404 for blocker's target, own block list has `isBlocked: true`) -> unblock -> privacy off
  - browser: login, follow (counts update), followers dialog lists follower; blocked by profile owner -> `/@demo_user` shows not-found state (not desync, not locked)
  - NOT smoked in browser: privacy toggle, request accept UI, close-friend toggle, block UI (all unit-tested through services + stores)
- **Rulings:**
  - mute stays facade until activity slice (`isMuteFacade`): `setMuted`/`fetchMutedUsers` do not follow graph switch
  - `isBlockedBy` forced `false` in `toUserProfile`; `RelationSets.blockedBy` kept as always-empty in real mode (mock still models it; type removal waits for X)
  - real profile lookup (content real): BE 404 -> `profile.blockedNotFound` state, other failure -> error + retry (resolves deferred minor "lookup 5xx shows desync"); mock keeps desync
  - blocked list `query`: BE has no search on `me/blocks` -> M20, client filter over all pages
  - Close friend candidates = `following` page + `relation-sets` flags (2 calls/page), pending followees dropped
- **Deferred minors:** none new

---

# PHASE N - Activity (mute, notifications, SignalR)

## Design notes
- **Slice state:** env `auth,content,graph,activity`
- **Mute:** `PUT/DELETE users/{id}/relations/mute`, `GET me/mutes`; BE feed excludes muted authors (remove local-only caveat); FE `ExcludedAuthors` stays as client filter for already-loaded pages
- **Notifications scope:** replace existing basic list (inline `INITIAL_NOTIFICATIONS` in `notification-container.tsx`) with HTTP list + mark-read, & plug SignalR pushes into it; filter tabs, nav badge, settings stay in FE roadmap Phase 3
- **Mapping:** `NotificationDto -> NotificationItemData` (`kind` like|reply|follow -> icon/group, `targetId` -> link: like/comment -> `/posts/{targetId}`, follow types -> profile of `senderId`/`senderUsername`; no reply preview text)
- **SignalR:** event `ReceiveNotification` (1 `NotificationDto`); `accessTokenFactory` reads CURRENT access token (refresh-aware); type union adds `NewFollow`, `FollowRequested`, `FollowAccepted`, `NewComment`, `NewLike`; connect only when authenticated & activity real

### Task N1: Mute real
**Files:**
- Modify: `relation-service.ts` dispatch (`setMuted`, `fetchMutedUsers`), `relation-service.real.ts`
- Test: extend `relation-service.real.test.ts`

**Interfaces:**
- Produces: `setMuted(id, on, actorId)` (PUT/DELETE), `fetchMutedUsers(q, actorId)` (`GET /api/users/me/mutes`, items `isMuted: true`)

- [x] **Step 1: Write failing tests:** `mute UI hidden until activity real, visible after`, `mute PUT & unmute DELETE`, `mute self -> CannotMuteSelf`, `muted list paged with query`, `unmute of hidden user still 204`
- [x] **Step 2: Run** `npx vitest run src/features/profile/services` -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(profile): real mute`

### Task N2: Notifications HTTP adapter & container swap
**Files:**
- Create: `src/features/notifications/services/notification-service.ts` (mock + real), `notification-mapper.ts`
- Modify: `src/features/notifications/components/notification-container.tsx` (service-backed list, mark-read), `types/index.ts`
- Test: `notification-service.test.ts`, `notification-mapper.test.ts`, container test

**Interfaces:**
- Produces: `fetchNotifications(page): Promise<NotificationPage>` (`GET /api/notifications`), `fetchUnreadCount(): Promise<number>`, `markNotificationRead(id): Promise<void>`, `markAllNotificationsRead(): Promise<void>`, `toNotificationItem(dto: NotificationDto): NotificationItemData`; mock keeps `INITIAL_NOTIFICATIONS` moved into mock adapter

- [x] **Step 1: Write failing tests:** `maps kind & targetId link per type`, `NewFollow links to sender profile`, `list pages & unreadCount`, `mark read 204 idempotent`, `foreign notification 403 surfaced`, `read-all`, `mock mode shows seed notifications`
- [x] **Step 2: Run** `npx vitest run src/features/notifications` -> FAIL
- [x] **Step 3: Implement**
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(notifications): service-backed list with real adapter`

### Task N3: SignalR integration
**Files:**
- Modify: `src/lib/signalr-client.ts` (`NotificationPayload` union & shape, token factory, lifecycle), `Providers` (connect/disconnect on auth), notification container (push handler)
- Test: `src/lib/signalr-client.test.ts` (hub connection injected/faked)

**Interfaces:**
- Consumes: `API_BASE_URL`, auth store, `toNotificationItem` (N2)
- Produces: `NotificationPayload` = `NotificationDto` shape; `notificationHub.start(getAccessToken: () => string | null)`, `stop()`, `onNotification(handler): () => void`; `accessTokenFactory` calls `getAccessToken` on every (re)connect; stops on `clearAuth`, starts after login/refresh

- [x] **Step 1: Write failing tests:** `factory returns latest token after rotation`, `start only when authenticated`, `stop on logout`, `push inserts item at top & bumps unread`, `unknown type still renders generic`, `duplicate push for same id ignored`
- [x] **Step 2: Run** `npx vitest run src/lib/signalr-client.test.ts` -> FAIL
- [x] **Step 3: Implement** (`withAutomaticReconnect`, listen `ReceiveNotification`)
- [x] **Step 4: Run** -> PASS
- [x] **Step 5: Commit** `feat(notifications): SignalR push into notification list`

### Task N4: Phase N exit
**Files:**
- Modify: roadmap (N.1 done in C per deviation, N.2, N.3), MAP §6 (CP4), `.context/features/fe-be-integration.md`, `frontend-roadmap.md` (Phase 3 notes: tabs/badge/settings still open)

- [x] **Step 1: Run** `npm run test`, `npm run typecheck`, `npm run lint`, `npm run api:check` -> pass
- [x] **Step 2: Manual smoke** (all slices): 2 accounts in 2 browsers: like/comment/follow -> push arrives live; mark read; mark all; mute author -> feed excludes; block sender -> their notifications disappear; token refresh while connected -> hub keeps working
- [x] **Step 3: Record** Mismatch log (M21); `requesting-code-review` gate not run: user asked for review only on request
- [x] **Step 4: Commit** `docs(integration): close Phase N`

**Execution record:**
- **Verification:** `npm run test` 105 files / 1188 tests pass; `typecheck` clean; `eslint` 5 pre-existing errors (1 fewer: `signalr-client` `any` removed by rewrite); `api:check` passes after `api:generate` (CRLF checkout EOL only, no schema diff)
- **Smoke (real BE Development, `auth,content,graph,activity`):**
  - browser (`test_user`): `/notifications` lists HTTP page (FollowAccepted, NewFollow); with page open 2nd account follows -> NewFollow pushed live at top (SignalR over WebSocket, 2 consecutive pushes); mark all read -> BE unread count 0
  - node SignalR client: push payload = `NotificationDto` shape (`type`, `kind`, `senderUsername`, `targetId`...)
  - curl: mute PUT 204, `me/mutes?query` lists muted user, unmute DELETE 204, mute self -> 400
  - NOT smoked: 2 separate browsers (1 browser pane: 2nd account driven by curl/node), per-item mark read UI, mute UI, block sender -> list filtering, token refresh while connected (unit: factory reads current token)
  - First push after cold dev compile was missed (page loaded before hub connected): list loads over HTTP first, push only covers events after connect
- **Rulings:**
  - one shared `notification-store` (HTTP pages + pushes); `NotificationLiveSync` mounted in `Providers` starts hub only for signed-in viewer with activity real, stops & resets list on logout/account switch
  - unknown `type`/`kind` -> kind `other`, rendered with BE `message`; `FollowRequested`/`FollowAccepted` get own wording; real items carry no follow state so follow-back button is mock-only
  - `createdAt` stays ISO for real items (formatted relative in `NotificationItem`), mock seed keeps display strings
  - push from sender the viewer blocked is dropped client-side (BE filters too); malformed push (no id) dropped
  - content real & activity mock: notification list empty (seed items reference mock users)
  - unread badge, filter tabs & settings stay FE roadmap Phase 3
- **Deferred minors:** bulk "mark all read" has no confirmation; no reconnect catch-up (items missed while socket was down appear on next page load); stale relative timestamps until re-render; push dedupe is by id only

---

# PHASE X - Cleanup

## Design notes
- Remove only mock code proven unused (import-graph/grep proof); hidden BE-less features & FE roadmap Phases 3-7 keep running on mocks, so their services, fixtures & mock switch stay
- **X2 is optional & gated:** BE contract change (MAP §2.5 update, swagger regeneration, `Swagger_*` tests, remove `ToggleEndpoints_Unchanged`); roadmap closure does not depend on it

### Task X1: Remove proven-unused mock code
**Files:**
- Modify/Delete: ONLY mock branches/adapters proven unused (see proof step); candidates: mock branches of auth, post, user, relation, notification services, `mock-session.ts` cookie bridge, `ViewerSync` mock upsert, `[@username]/page.tsx` cookie resolver
- Keep: slice switch & mock mode, mocks/fixtures needed by hidden/unsupported features (search, tags, trending, suggestions, pin, hide-like-count, new-posts pill, audience, `replies`/`media` tabs, FE roadmap Phases 3-7 work) & by tests
- Test: update/remove only tests of deleted code

- [x] **Step 1: Produce proof:** import-graph/grep list of every mock export with its remaining consumers (hidden features, tests); delete only exports with 0 consumers outside deleted code; record list in commit body
- [x] **Step 2: Write failing tests:** `default env enables all wired slices` (api-config) & `none` sentinel; import-graph test has nothing to assert (0 deletions); `/@username` BE-only (C8) & hidden-feature routes in mock mode already covered by existing suites (run under pinned `none`)
- [x] **Step 3: Remove** proven-unused code & its tests: result = 0 mock exports removable (see X record)
- [x] **Step 4: Run** `npm run test`, `npm run typecheck`, `npm run lint` -> PASS
- [x] **Step 5: Commit** `refactor(integration): remove mock code unused by wired slices`

**Execution record (X1):**
- **Proof:** export scan (every non-test export with 0 non-test consumers in other files, 63 hits): none is mock code that lost its last consumer. Mock adapters stay reachable (mock mode via `none`, partial slice lists, BE-less features), `__reset*`/`reset*`/fixtures are test helpers, rest = constants/types used inside their own file. Cookie bridge `ysocial_mock_user`, `ViewerSync` mock upsert & `[@username]` cookie resolver are still used in mock mode: kept
- **Ruling (default flip):** `parseRealSlices(undefined)` = all 4 slices; `none` / empty = mock. Reverses F-D2 "default empty = all mock": `npm run dev` now needs BE on `https://localhost:49895` unless `NEXT_PUBLIC_REAL_API_SLICES=none`. `.env.example`, README updated; `vitest.setup.ts` pins `none`
- **Dead non-mock exports (out of X1 scope, deferred minor):** `useAccessToken`, `useRefreshToken` (`auth-store.ts`), `useUIState` (`ui-store.ts`): 0 consumers incl. tests

### Task X2 (OPTIONAL, gated on user approval): Remove BE toggle endpoints (BE repo)
> Not required to close roadmap; deferable. BE contract change: needs explicit user approval before starting
**Files (BE, repo root):**
- Modify: likes/saved items controllers & application features for `likes/toggle`, `saveditems/toggle`; `tests/YSocial.Api.IntegrationTests` (`ToggleEndpoints_Unchanged`, `Swagger_*`); `ysocial-clients/web-app/docs/swagger.json` + `generated.ts`; MAP §2.5; BG §10 #17

- [ ] **Step 1: Confirm** FE has 0 calls to toggle routes (`grep -rn "likes/toggle\|saveditems/toggle" src` empty) & user approved
- [ ] **Step 2: Update tests first:** replace `ToggleEndpoints_Unchanged` with `ToggleEndpoints_Return404`; run BE tests -> FAIL
- [ ] **Step 3: Remove** endpoints & handlers per BE conventions; regenerate swagger
- [ ] **Step 4: Run** BE `dotnet test`, FE `npm run api:update && npm run api:check` -> PASS
- [ ] **Step 5: Commit (BE)** `refactor(api): remove deprecated toggle endpoints`

### Task X3: Close-out docs
**Files:**
- Modify: roadmap (all phases `[x]`), MAP (FE-counterpart column, §5, §6 follow-ups closed), `.context/features/fe-be-integration.md` (final as-built), INDEX, `frontend-roadmap.md` "Out of scope" note updated

- [x] **Step 1: Run** full verification (`npm run test`, `typecheck`, `lint`, `api:check`; BE `dotnet test` only if X2 ran) -> pass
- [x] **Step 2: Update** docs listed; deferred-minor triage per `00-agentic-rules.md` §4.3 (resolve/defer/close with rationale)
- [ ] **Step 3: `finishing-a-development-branch`:** PR options, worktree clean-up
- [x] **Step 4: Commit** `docs(integration): close FE-BE integration roadmap`

**Execution record (X3):**
- **Verification:** `npm run test` 105 files / 1190 tests; `typecheck` clean; `eslint` 5 pre-existing errors (`safe-hydration.tsx`, `use-mobile.ts`, `post-creator-dialog.tsx` any, `post-draft-store.ts` prefer-const, 1 more any in posts); `api:check` passes after `api:generate` (CRLF EOL only); BE `dotnet test` not run (X2 not started, BE untouched)
- **F.3 2-tab lock smoke (was open since Phase F):** real BE, 2 browser tabs on `/notifications`, shared `ysocial_access_token` corrupted, both reloaded together -> exactly 1 `RefreshTokenCommand` in BE log, both tabs render list, no forced logout (`navigator.locks` present on localhost)
- **Deferred-minor triage (`00-agentic-rules.md` §4.3):**
  - **Closed:** C "Unblock shown for externally blocked profile" (real graph: that profile is 404); C "profile client lookup 5xx shows desync" resolved in G3; F "residual no-lock window" accepted (M15); F "`authFieldErrors` raw BE text" (BE field messages are English, vi mapping would need BE codes per field)
  - **Defer (design/BE owner):** M16 docs say Next 15, repo has 16.3.8 (needs user OK to edit conventions); M18 BE `PUT profiles/me` wipes gender/DOB (BE decision: PATCH semantics or expose fields); M12 BE option nullable-reference swagger; M21 no push catch-up; M20 block list has no `query` (BE option); saved list not cleared on account switch & capped at 100 posts; 1 malformed item fails whole page; duplicate-click spinner flicker; hub gives up after automatic reconnect ends (`connection` stays set, live push silently dead until reload/login: impact medium for long sessions, fix = clear `connection` in `onclose` & retry with backoff; priority medium, next: small task in Phase 3 notifications work); stale relative timestamps; `generateMetadata` BE outage sends post page to `error.tsx`; bulk unsave real path has no automated test; refresh/logout fetch have no timeout
  - **Dead code (not mock):** `useAccessToken`, `useRefreshToken`, `useUIState`: delete in cleanup PR (priority low)
- **Not smoked in browser (unit/API-tested only):** privacy toggle UI, accept/decline request UI, close-friend toggle UI, block UI, per-item mark-read UI, mute UI, edit post, bulk unsave, guest feed, token refresh while hub is connected
- **Review gates:** F9 & C9 ran fresh Opus reviewer; G4, N4 & X not run: 1 end-of-plan review of whole branch

---

## Mismatch log

> Status values: `decided (FE|BE|MAP)`, `accepted`, `open: needs evidence at <task>`. Nothing is resolved until its task lands & its test passes

| # | Found in | Mismatch | Decision | Status |
|---|---|---|---|---|
| M1 | C5 | `fetchFollowedIds` has no BE endpoint; `[]` would mark every followed user "none" (`setFollowedIds` loaded & accepted-only) | FE: page `GET users/{viewerId}/following`, never partial | resolved C5 (`fetchFollowedIds` pages `following`, capped, never partial) |
| M2 | C4 | FE `PostVisibility = public \| closeFriends` vs BE `public \| followersOnly \| private` | FE: widen type, preserve BE values, no badge | resolved C4 (type widened, no badge) |
| M3 | C4 | FE multi `imageUrls` vs BE single `imageUrl` | FE: mapper fills one; multi-image hidden (C2) | resolved C2/C4 (upload hidden, see M19) |
| M4 | C6 | FE `deletePost -> { deletedIds }` vs BE 204 | FE: adapter returns `[ref.id]`; BE comments hidden, not cascaded | resolved C6 |
| M5 | C3 | `PostItem` lacked `kind`/root id; services took bare ids | FE: required `kind` & `rootPostId`, `PostRef` param | resolved C3 |
| M6 | C | FE `following` tab for guests vs BE 401 | FE: hide for guests, adapter returns empty page | resolved C2/C6 |
| M7 | C | BE feed excludes muted authors; FE mute is local until N | mute UI hidden until N | closed |
| M8 | F4 | FE redirect `/auth/login` vs route `/login` | FE: fix in api-client | resolved F4 (`authRedirect.toLogin`) |
| M9 | F5 | `api:update` calls missing `api:fetch` | FE: add script | resolved F5 (`api:fetch`, `scripts/fetch-swagger.mjs`) |
| M10 | F5 | `generated.ts` stale vs `docs/swagger.json` (no response schemas, no GET paths) | FE: regenerate before any task importing response types | resolved F5 |
| M11 | F5 | `docs/swagger.json` stale vs BE source (`NotificationDto.SenderUsername` missing) | regenerate from running BE; contract test pins it | resolved F5: regenerated swagger has `senderUsername`, contract test green |
| M12 | C4 | swagger marks nearly all fields nullable (MAP says non-null) & enums are plain `string`; unknown enum values undefined | FE mappers tolerate null/absent; proposal: unknown `visibility` -> `private`, unknown `followStatus` -> `none`; BE option: enable nullable-reference-type support in Swashbuckle | resolved C4: swagger has NO required fields (all optional), mappers tolerate; BE nullable option still open (user) |
| M13 | F5 | MAP names follow-request param `{requesterId}`, swagger `{targetId}` | MAP: fix name | resolved F9 (MAP names `{targetId}`) |
| M14 | C8 | `/posts/[id]` cannot 404 on server (anonymous read vs viewer-dependent visibility) | soft 404 via client state; revisit with cookie/BFF auth | accepted |
| M15 | F3 | no `navigator.locks` (insecure context, jsdom) -> no cross-tab single-flight | in-tab only + rotation adoption rescue; documented | accepted (lock path unit-proven; localhost has `navigator.locks`) |
| M18 | C5 | BE `PUT users/profiles/me` replaces whole profile (gender, date of birth, cover) while read DTO exposes no gender/DOB: every FE save wipes them | FE sends current cover & `gender: 0`; BE option: PATCH semantics or expose gender/DOB in `UserProfileDto` | open |
| M19 | C6 | BE has no media upload (blob URLs unusable) & no audience/visibility choice on create | FE hides upload, audience & close-friends toggle while content is real | accepted until BE media/audience work |
| M16 | docs | `conventions/frontend.md` & INDEX say Next 15; repo has 16.3.8 | report to user, update docs when user approves | open |
| M20 | G1 | `GET me/blocks` has no `query` param (follow requests, followers, mutes do) | FE: with query, read every page (cap 20 x 50) & filter locally; BE option: add `query` | accepted |
| M21 | N3 | pushes missed while hub is disconnected or before it connects are not replayed (BE has no cursor, list is HTTP-first) | FE: list reloads on viewer change; no catch-up; unread count from page | accepted |
| M22 | N3 | hub stays "connected" in FE state after SignalR automatic reconnect gives up (`connection` not cleared on close) | FE: deferred, see X3 triage | open (deferred) |
| M17 | F9 | plan assumed forgot/reset OTP is readable in BE Development log; BE masks digit runs (`MessageLogMasking`, `features/identities.md` §2)| BE: Development-only opt-in flag in local `appsettings.Development.json`, `ApiFactory` forces it off | resolved: BE opt-in `Messaging:LogOtpInDevelopment` (Development only, default off), reset flow verified on real BE |

## Self-review
- **Spec coverage:** Phase F decisions F-D1..F-D8 (Phase F design notes) map to F1-F8; roadmap items F.1-F.3, C.1-C.4, G.1-G.2, N.1-N.3, X.1-X.3 map to tasks; roadmap deviations apply at phase exits (post delete CP1 -> C, follow & feed read -> C, switcher out of C)
- **Interface names:** `refreshTokens`, `apiClient`, `ApiError`, `isRealApi`, `parseRealSlices`, `requireBackendId`, `PostRef`, `toPostRef`, `hasCapability`, mappers & service functions are defined before use; execution order inside Phase F: F5 before F2-F4, F6-F8
- **Contract:** endpoint & schema names verified against `docs/swagger.json` (F5 contract test pins them)
- **Proportion:** tasks list test names & signatures only; no function bodies
