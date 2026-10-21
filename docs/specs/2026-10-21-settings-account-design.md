---
module: Settings hub & Account (Roadmap Phase 4 + 2.7 Profile switcher) - design
date: 2026-10-21
---

# Settings hub, account & profile switcher - design (FE + BE vertical slice)

## 1. Scope & classification

| Item | Class | Outcome |
|---|---|---|
| appearance: theme, font size, reduced motion | FE-only | `settings-store` (4.2), theme stays in `next-themes`; toggles leave `MainLayout` dropdown |
| language | FE-only | `ui-store` stays ONLY locale owner (SSR-safe hydration already solved) |
| content prefs: link to muted, hide like count, hide share count | FE-only | viewer DISPLAY preference in `settings-store`; NOT per-post `hideLikeCount` (1.5, capability `hideLikeCount`) |
| time-management | FE-only | local, per device, visible-tab seconds per day, label says "on this device" |
| privacy (+ entries to `blocked`, `close-friends`) | exists | routes stay; privacy page links to them; "who can reply / mention" DEFERRED (no account policy, no mention model, BG §9) |
| account: email, username (read-only), gender, birth date | vertical | BE adds owner-only `gender` & `dateOfBirth` to `MeDto` (D29) |
| sessions: list + remote logout | vertical | BE list & revoke (D30) |
| danger: delete account | FE over existing BE | `DELETE /api/identities/account`; DEACTIVATE DEFERRED (login rejects inactive accounts, no reactivation path, BG §10 #26) |
| 2.7 profile switcher | FE over existing BE | `GET me` + `PUT profiles/switch` (no BE change) |

Out of scope: create-profile, username/email change, deactivate, reply/mention policy, real device names (UA string only)

Route naming: roadmap's `liked` -> `content` (it holds muted link + display prefs, nothing about likes received)

## 2. Contract delta (MAP update BEFORE FE tasks)

### 2.1 D29: owner-only demographics on `MeDto`
- `GET /api/users/me` -> `MeDto { profile, email, profiles, gender, dateOfBirth }`
  - `gender`: `unspecified | male | female | other` (read DTO string union, D9); request stays int
  - `dateOfBirth`: `yyyy-MM-dd` (`DateOnly`) or `null`
- NEVER on `UserProfileDto` (same field set for every viewer, D15)
- `PUT profiles/me` semantics unchanged: `displayName`/`bio`/`avatarUrl`/`coverUrl` REPLACE stored values (null clears), `gender`/`dateOfBirth` omitted keep stored. FE account form MUST send full current profile fields
- **Wire format (asymmetric on purpose):** request `UpdateProfileRequest.dateOfBirth` is OpenAPI `string` + `format: date-time` (nullable, exists in `swagger.json`); response `MeDto.dateOfBirth` is `date` (`yyyy-MM-dd`). FE builds request value by string concat `${yyyy-MM-dd}T00:00:00Z` (no `Date` object, no `toISOString()`), BE stores date part (column `date`, no shifting)
- **Tests:** BE round trip `PUT "1999-05-20T00:00:00Z"` -> `GET me` = `1999-05-20`; FE mapper test runs under `TZ=Asia/Ho_Chi_Minh` & `TZ=America/Los_Angeles` (same string both ways); leak test: `UserProfileDto` JSON (own profile, other profile, followers list) has no `gender`/`dateOfBirth`/`email` keys
- **Propagation:** MAP §2.2 (`me` row), §3 DTOs, §7 D29 & D30; BE `[ProducesResponseType]` typed so swagger carries `MeDto` fields + `SessionDto`; `Swagger_*` contract tests; FE `api:fetch` -> `api:generate` -> `api:check` clean BEFORE any FE task

### 2.2 D30: sessions
- Session = 1 token family (chain linked by `ReplacedByTokenId`); its active head token represents it
- `GET /api/identities/sessions` ([Authorize]) -> 200 `SessionDto[]`, newest `lastRefreshedAt` first
  - `SessionDto { id, userAgent: string|null, profileUsername: string|null, createdAt, lastRefreshedAt, isCurrent }`
  - `id` = active head token id (changes on rotation: after refresh old id still resolves to its family)
  - `createdAt` = family root (sign-in time), `lastRefreshedAt` = head `CreatedAt` = last token ISSUE (login / refresh / switch). NOT user activity: BE has no activity tracking, so field is named for what it is; UI label "last refreshed"/"signed in", never "last active"
  - `profileUsername` = bound profile (deleted -> null)
  - `isCurrent`: family contains JWT `sid` claim token
- `DELETE /api/identities/sessions/{id}` ([Authorize]) -> 204; token id of ANY member of one of THIS account's families
  - Unknown or foreign id -> 404 `NotFound` (no probing); family already ended -> 204 (idempotent)
  - Revoking current session = logout (client clears local state)
  - Runs under `IAccountSessionLock` (BG §6.4): lock is PROCESS-LOCAL, it serializes only same-instance writers
  - Multi-instance safety comes from `Account.Version` optimistic concurrency (revoke changes refresh token, so `Version` bumps): loser gets `ConcurrencyConflictException` -> 409 `Conflict` via `GlobalExceptionHandler` (client retries), same as login/delete (BG §6.4). lock is never claimed to give cross-instance guarantee
  - Tests: same-instance race (revoke vs refresh of 1 family, 50x barrier: exactly 1 wins, no active token survives revoke), conflict outcome pinned in `SessionConflictTests` (SQLite; real PostgreSQL not re-verified, stated in as-built)
- JWT gains `sid` claim = id of refresh token issued together with access token (login, refresh, switch). `IUserContext.SessionId` (`Guid`, empty when missing); old tokens without `sid` -> no `isCurrent`
- `RefreshToken.UserAgent` (max 256, nullable) captured at login from `User-Agent` header, copied on rotation. Migration `AddRefreshTokenUserAgent`; login body unchanged
- No new error codes (`CodesSnapshot_MatchesApprovedList` stays green)

### 2.3 Capability table & access guards (separate concerns)
- **Capability** (what build/slices can do): `accountUi` on only when `auth` slice is real (account, sessions, danger need real identity; no mock adapter); `profileSwitcher` same rule; appearance, language, content, time-management always on (FE-only); `SettingsSection.capability` becomes optional. Off -> nav entry hidden & route shows `FeatureUnavailable`
- **Auth guard** (who may see it): existing `SettingsGuestGate` in settings layout (guest -> login CTA, waits for hydration). Sections never re-check auth themselves & never treat capability as auth
- Tests pin matrix: guest + capability on -> gate; signed in + capability off (mock mode) -> unavailable; signed in + on -> section; stale mock session in real mode -> existing hydration cleanup then gate

## 3. BE design
- `MeDto(Profile, Email, Profiles, Gender, DateOfBirth)`; `GetMe` fills from active profile `ProfileInfo`
- `Account.GetSessions()` (domain): per active head token, walk predecessors (token whose `ReplacedByTokenId` = current) for root; `Account.RevokeSession(Guid tokenId)` finds token by id, walks successors, revokes all (returns false when id unknown); `Account.IsSessionCurrent(head, sid)`
- `IJwtProvider.GenerateToken(user, account, RefreshTokenId? sessionId = null)`; `LoginCommandHandler` generates AFTER token is added (inside lock)
- `LoginCommand` gains `UserAgent` (init, set by controller from header, not from body)
- Handlers: `GetSessions` (query), `RevokeSession` (command, lock rules: lock first, load, revoke, commit inside lock)

## 4. FE design

### 4.1 `settings-store` (4.2)
- Fields: `fontSize` (`sm|md|lg`), `reducedMotion` (`system|reduce`), `hideLikeCounts`, `hideShareCounts`; separate state/actions, `useShallow` for multi selects
- **Reduced motion semantics:** `system` = follow OS `prefers-reduced-motion` (existing `motion-reduce:` variants keep working); `reduce` = force reduced even when OS allows. No `off`: forcing motion over OS reduce request would break a11y convention
- **Scope = this DEVICE, not profile:** everything in `settings-store` & `usage-tracker` lives in localStorage & survives profile switch & logout (appearance/display prefs, UI copy says "on this device"). Server-side per-profile preferences stay out of it: notification preferences (D27) are owned by BE & refetched on switch
- `persist` with `skipHydration: true`, `rehydrate()` called once after mount (same pattern as `ui-store.hydrateLocale`); SSR/first render uses defaults
- `SettingsEffects` (mounted in `Providers`): writes `data-font-size` & `data-motion` on `<html>`; `globals.css` maps them (root font scale; `data-motion="reduce"` zeroes animation/transition durations; `system` leaves media query alone)
- Time usage lives in its own module (`usage-tracker`), key `ysocial_usage_v1`, NOT in `settings-store` (frequent writes)

### 4.2 Sections
| Route | Content |
|---|---|
| `/settings/account` | email & username read-only, gender select, birth date; Save stays enabled + inline spinner, re-submit ignored while pending (`useSubmitGuard`, same for revoke & delete) |
| `/settings/privacy` | existing + links to `blocked`, `close-friends` |
| `/settings/notifications` | existing |
| `/settings/appearance` | theme (light/dark/system), font size, reduced motion |
| `/settings/language` | vi / en |
| `/settings/content` | link to muted, switches hide like / share count (PostCard action bar) |
| `/settings/time-management` | today + 7-day bars + daily average |
| `/settings/sessions` | list, "this device" badge, revoke with confirm |
| `/settings/danger` | delete account: AlertDialog + type username to confirm; then `clearAuth` + `/login` |

### 4.3 Profile switcher (2.7)
- Dropdown (MainLayout) shows OTHER profiles when `GET me` returns > 1; loads when dropdown opens, `profileSwitcher` capability only
- **Lock without re-entry:** `navigator.locks` is NOT re-entrant & `apiClient` refreshes on 401 through same `ysocial-refresh` lock, so switch that holds lock & calls `apiClient` could deadlock. `token-refresh.ts` exports `withRefreshLock(fn)` + unlocked `rotate`; switch runs ONLY raw `fetch` (no `apiClient`, auth-call semantics) inside lock:
  1. acquire lock, re-read stored tokens (adopt rotation done by another tab)
  2. access token rejected (401 `Unauthenticated`) -> call unlocked `rotate` once, retry PUT once; never `refreshTokens()`
  3. `PUT profiles/switch {profileId, refreshToken}` with stored refresh token
- **Atomic commit, no stale viewer:** BE has already rotated (old refresh token is dead), so tokens MUST be persisted. In 1 synchronous step: `setTokens` + `updateUser(authUserFromSummary)` where user is built from `ProfileSummaryDto` dropdown already holds (id, username, displayName, avatarUrl) + current email. `GET me` afterwards only refreshes snapshot; its failure changes nothing (identity already consistent with tokens). Order never yields new tokens with old `user`
- Errors: 401 `InvalidRefreshToken` -> `clearAuth` + `/login`; 403 `ProfileNotOwned` -> refetch me, toast; network/5xx before PUT response -> nothing changed (no commit), toast + retry
- **Central viewer reset:** 1 `resetViewerScopedState()` (feature registry, each store registers its reset) called by `ViewerSync` on viewer-id change, so login/logout/switch/cross-tab all use same path (no per-caller list). Covers: feeds, follow projection & relation sets, post-store viewer flags on cached posts, notification store + unread count + preferences, saved list, follow-request count, SignalR hub stop/start (hub user bound at connect), mock-session cookie, `router.refresh()`. NO TanStack step: `QueryClientProvider` exists in `providers.tsx` but no `useQuery`/`useMutation` is used anywhere, so there is nothing to reset (re-check before implementing; if query appears later it uses viewer id in its key)
- **Tests (each stated failure mode):** reset covers every store above; stale in-flight request started under profile A never applies after switch to B (generation guard); switch concurrent with refresh in same & another tab (exactly 1 rotation, no deadlock, no logout); 401 expired access token path; `GET me` failure after PUT keeps new tokens + consistent user; cross-tab `storage` event mirrors switch & resets other tab; SignalR stop/start order (no push of A delivered to B)

## 5. Edge cases
- Birth date in future -> BE 400 `ValidationFailed`; FE max = yesterday
- Account save with profile changed in another tab: FE sends fresh `GET me` values captured on form open (last write wins, documented)
- Session revoked remotely: next refresh of that device -> 401 -> existing logout path
- Revoke list stale (head rotated between list & delete): id still resolves via family walk
- Mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`): account, sessions, danger hidden, switcher hidden; appearance, language, content, time-management work

## 6. Mismatch log
None
