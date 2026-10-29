# Settings hub, account & profile switcher (Phase 4 + 2.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans (user chose inline, few subagents). Steps use checkbox (`- [ ]`). TDD: RED -> GREEN -> refactor

**Goal:** settings hub (9 sections) + `settings-store`, owner demographics, session list & remote logout, profile switcher, on real BE

**Architecture:** BE adds `gender`/`dateOfBirth` to `MeDto` (D29), session list & revoke + JWT `sid` claim + `RefreshToken.UserAgent` (D30). FE adds FE-only sections over `settings-store`/`ui-store`, real-only account/sessions/danger sections & switcher that reuses cross-tab refresh lock without re-entering it

**Tech Stack:** ASP.NET Core 8 / MediatR / EF Core (SQLite tests, Npgsql) | Next.js 16 / Zustand / Vitest

**Spec:** `docs/specs/2026-10-21-settings-account-design.md`. Paths: BE repo-relative; FE relative to `ysocial-clients/web-app/`

## Global Constraints
- C#: CRLF, file-scoped namespaces, `#region`, sorted usings, short English names; no new error codes (`CodesSnapshot_MatchesApprovedList` stays green); every endpoint `[ProducesResponseType]` with DTO + `ProblemDetails`
- Session token mutation follows BG §6.4: untracked lookup, lock, load, mutate, `unitOfWork.CommitAsync` INSIDE lock
- FE: no `any`, no inline CSS, Lucide only, `import type`, flat i18n keys `domain.name` (vi + en), animate `transform`/`opacity` only, no `hover:scale-*`, submit buttons stay enabled + inline spinner + `useSubmitGuard`, `useShallow` for multi-field selects, ONLY edit under `ysocial-clients/web-app/` for FE
- Generated files (`docs/swagger.json`, `src/lib/api/generated.ts`) never hand-edited: `npm run api:fetch` (BE running) -> `api:generate` -> `api:check`
- Commits: conventional, author = user, NO `Co-Authored-By`, no push
- Contract first: Task B4 (MAP) done BEFORE any FE task
- **Every task builds, passes its scoped tests & typecheck & is committable alone**: task owns its component, route page, `SETTINGS_SECTIONS` entry, i18n keys & tests; no task imports file created by later task
- Verification evidence: exact test counts per run; status honesty when unverified

## Review Focus
- Switch holds `ysocial-refresh` lock & its 401 path must NOT call `refreshTokens` (non-re-entrant lock = deadlock): test with lock fake that hangs on re-entry
- Switch failure classes: BEFORE PUT is sent (clean, state untouched) vs AFTER it may have reached BE (ambiguous: network/timeout/5xx; refresh token may already be rotated): defined recovery, tested
- New tokens persisted but `GET me` fails: identity must still match tokens (user from `ProfileSummaryDto`)
- Birth date in UTC+7 / UTC-8: `1999-05-20` stays `1999-05-20` both ways
- Stale response started under profile A (follow graph, relation sets, notifications, preferences) must not touch profile B after switch
- Revoke with rotated (stale) session id; foreign account id (404, no probing); revoke current session; revoked device's access token stays valid until expiry (D6)
- Mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`): account/sessions/danger/switcher hidden, no real call made
- Double click on Save / revoke / delete / switch sends 1 request

## File structure
BE (new): `Application/Models/SessionDto.cs`, `Application/Features/Identities/{GetSessions,RevokeSession}/*.cs`, migration `AddRefreshTokenUserAgent`
BE (modify): `Domain/Identities/{RefreshToken,Account}.cs`, `Infrastructure/Persistence/Configurations/AccountConfiguration.cs`, `Application/Models/MeDto.cs`, `Features/Users/GetMe/GetMe.cs`, `Features/Identities/{Login,RefreshToken}/*.cs`, `Features/Users/SwitchProfile/SwitchProfile.cs`, `Abstractions/Identity/{IJwtProvider,IUserContext}.cs`, `Infrastructure/Identity/{JwtProvider,UserContext}.cs`, `Api/Controllers/IdentitiesController.cs`, `Api/Program.cs:231`, `tests/YSocial.Application.UnitTests/Identity/SessionConflictTests.cs:49`
FE (new): `features/settings/store/settings-store.ts`, `features/settings/components/{settings-effects,appearance-section,language-section,content-section,time-management-section,account-section,sessions-section,danger-section}.tsx`, `features/settings/utils/{usage-tracker,describe-user-agent,birth-date}.ts`, `features/settings/services/account-service.ts`, `features/auth/components/profile-switcher.tsx`, `app/settings/(sections)/{account,appearance,language,content,time-management,sessions,danger}/page.tsx`
FE (modify): `lib/capabilities.ts`, `features/settings/{constants.ts,types/index.ts,index.ts,components/{settings-sections,settings-nav,settings-index,privacy-settings}.tsx}`, `app/providers.tsx`, `app/globals.css`, `components/layout/main-layout.tsx` (+test), `features/posts/components/post-card.tsx`, `features/posts/store/post-store.ts`, `features/profile/components/viewer-sync.tsx`, `lib/token-refresh.ts`, `features/auth/{services/auth-service.ts,types/index.ts,index.ts}`, `lib/locales/{vi,en}.json`

## Task dependency map (each task builds & passes alone on top of its predecessors only)

| Task | Needs | Creates what later tasks use |
|---|---|---|
| P0 | spec commit | amended spec |
| B0 | - | baseline numbers |
| B1 | B0 | `MeDto` fields |
| B2 | B0 | domain session API |
| B3 | B2 | sessions endpoints, `sid`, `UserAgent` (Swagger tests build their own doc in-process, so B1-B3 commit without regenerating FE types) |
| B4 | B1-B3 | contract docs, regenerated `swagger.json` + `generated.ts` |
| F1 | B4 | `settings-store`, `Providers` rehydrate |
| F2 | F1 | `accountUi`/`profileSwitcher`, optional capability, `visibleSections()` |
| F3 | F2 | appearance + language, shared key `settings.onThisDevice` |
| F4 | F3 | content section, privacy links |
| F5 | F3 | time-management section |
| F6 | F2, B4 | `account-service.ts`, `fetchMe` |
| F7 | F6 | sessions (adds to `account-service.ts`) |
| F8 | F6 | danger (adds to `account-service.ts`) |
| F9 | F6, F1-F2 | switcher (uses `fetchMe`), `resetViewerFlags` |
| F10 | all | docs |
- Per task, before commit: scoped tests, full `npm run test`, `npm run typecheck`; page files, section exports (`settings-sections.tsx`, `index.ts`), `SETTINGS_SECTIONS` entry, i18n keys (vi + en) & route test case land in SAME commit as section

---

## Task P0: amend spec (doc only)
**Files:** `docs/specs/2026-10-21-settings-account-design.md`
- [x] §2.2 rename `lastActiveAt`/`lastRefreshedAt` -> `lastTokenIssuedAt` (head `CreatedAt` = last login / refresh / switch token issue; NOT activity); UI label "Token issued", never "active"
- [x] §2.2 add: revoking ends family's REFRESH ability only; revoked device's current access token stays valid until expiry (<= 15 min, D6, BG §6.1); UI states it
- [x] §4.1 CSS: all `data-motion="reduce"` selectors (incl. `::before`/`::after`) scoped under `html[data-motion="reduce"]`; `system|reduce` is only semantic (already in spec, keep aligned with plan)
- [x] §4.3 add retry safety argument: `PUT profiles/switch` is NOT idempotent but is AT-MOST-ONCE: it consumes single-use refresh token under account lock, so replay can never switch twice (replay = 401 `InvalidRefreshToken`, pinned by BE test). What lost response cannot give is exactly-once: new tokens exist only in that response, so switch that committed but was not received is unrecoverable & ends as "session lost -> login". FE identity stays consistent in every outcome: tokens + user are replaced together, or nothing changes (old access token, still valid <= 15 min, keeps acting as OLD profile, matching old FE identity), or auth is cleared
- [x] §4.3 add token adoption rules: INSIDE lock switch reads tokens from `localStorage` (cross-tab source of truth), never from Zustand; PUT uses that stored access token; rotation only when PUT answers 401 `Unauthenticated` (expired access), via unlocked `rotateTokens` (which itself adopts when another tab already stored newer access token); commit (`setTokens` + `updateUser`, both write `localStorage`) happens BEFORE lock is released so waiting refresher adopts NEW pair, never dead one. Without `navigator.locks`, switch & in-tab refresh share 1 module-level promise chain (coordination `in-tab`, documented as mitigation only)
- [x] §4.3 add failure classes: PRE-SEND failures (no stored tokens, lock/rotate failure) = clean, nothing changed; AMBIGUOUS failures (PUT got no HTTP response: network, 15s timeout; or HTTP 5xx) = BE may have rotated refresh token: retry SAME PUT once inside same lock; success -> commit; 401 `InvalidRefreshToken` -> session is lost (new token never received): `clearAuth` + `/login` + toast; second ambiguous failure -> state untouched, toast "could not confirm, sign in again if you are signed out" (next refresh decides). Definitive 4xx (403 `ProfileNotOwned`, 401) as before
- [x] §4.3 replace "central registry" by: `ViewerSync` stays single viewer-change subscriber (`NotificationLiveSync` keyed by viewer id & `SavedList key={viewerId}` already own theirs); only missing piece added: `resetViewerFlags` on cached posts. Follow graph & relation sets are stored per actor id, so late answer for A can only write A's slot, never B's (test pins it)
- [x] §4.3 notification preferences ownership: server-side per PROFILE (D27), never in `settings-store`; cleared by `resetNotificationStore` (it resets preferences store) on viewer change & refetched by `NotificationSettings` effect keyed by viewer id
- [x] §4.2 danger row: title "Danger zone", delete only (deactivation stays deferred, no wording about it in UI)
- [x] Commit `docs(settings): amend spec after review (switch failures, session naming, reset ownership)`

## Part 1 - Backend

### Task B0: baseline (no commit)
- [x] `dotnet test` (3 projects) & in FE `npm run test`, `npm run typecheck`, `npm run lint`, `npm run api:check` on clean branch; record exact passed/failed/skipped counts in plan's Mismatch log as baseline. Existing failures are reported, not fixed here. Every later "all green" claim quotes actual numbers & delta from this baseline
- [x] Doc counts (BG §11, MAP header) are updated from FINAL actual numbers in B4/F10, never from this plan

### Task B1: `MeDto` demographics (D29)
**Files:** Modify `Application/Models/MeDto.cs`, `Features/Users/GetMe/GetMe.cs`; Test `tests/YSocial.Api.IntegrationTests/Users/MeDemographicsTests.cs`
**Interfaces:** Produces `MeDto(UserProfileDto Profile, string Email, IReadOnlyList<ProfileSummaryDto> Profiles, string Gender, DateOnly? DateOfBirth)`; `Gender` = camelCase of `Gender.Name` (pattern `UserProfileProjector.ToCamel`)
- [x] RED tests: `Me_Defaults_GenderUnspecified_DobNull`; `Me_AfterPut_ReturnsMaleAndDateOnly` (PUT `{displayName, gender:1, dateOfBirth:"1999-05-20T00:00:00Z"}` -> `gender == "male"`, `dateOfBirth == "1999-05-20"`); `Put_OmittedDemographics_KeepsStored`; `Put_FutureDob_Returns400ValidationFailed`; `ProfileDtos_NeverExposeDemographics` (keys `gender`, `dateOfBirth`, `email` absent from `GET users/{id}`, `by-username`, followers list items, `me.profile`)
- [x] Run `dotnet test tests/YSocial.Api.IntegrationTests --filter MeDemographicsTests`, expect FAIL
- [x] Implement DTO + handler (`DateOnly.FromDateTime` on stored value); run, expect PASS; run full `dotnet test` (Swagger tests may need B4 regen, note)
- [x] Commit `feat(users): expose owner gender & birth date on MeDto`

### Task B2: sessions domain + migration (D30)
**Files:** Modify `Domain/Identities/RefreshToken.cs`, `Account.cs`, `AccountConfiguration.cs`; Create migration `AddRefreshTokenUserAgent`; Test `tests/YSocial.Domain.UnitTests/Identities/AccountTests.cs`
**Interfaces:** Produces
- `RefreshToken.UserAgent: string?` (truncated to 256)
- `Account.AddRefreshToken(string deviceId, UserId userId, string? userAgent = null): RefreshToken`; `RotateRefreshToken` copies `UserAgent`
- `record SessionInfo(RefreshTokenId HeadId, UserId UserId, string? UserAgent, DateTime CreatedAt, DateTime LastTokenIssuedAt)` in `Domain/Identities`
- **Timestamp source of truth:** `RefreshToken.CreatedAt` is set ONCE at construction (`DateTime.UtcNow`) & never mutated; rotation creates NEW token (old one only gets `RevokedAt`/`ReplacedByTokenId`). So `LastTokenIssuedAt` = active head `CreatedAt`; `CreatedAt` (sign-in) = `CreatedAt` of family's oldest member (root); `ExpiryTime`/`RevokedAt` are never used for these two
- `Account.GetSessions(): IReadOnlyList<SessionInfo>` (1 per active head), ordered by `LastTokenIssuedAt` DESC, ties by root `CreatedAt` DESC then `HeadId` (deterministic); `SessionDto` maps 1:1 (`Id` = `HeadId`), controller never re-sorts
- `Account.RevokeSession(RefreshTokenId tokenId): bool` (false = id not in this account; true also when family already ended)
- `Account.BelongsToSession(RefreshTokenId headId, RefreshTokenId probe): bool`
- [x] RED unit tests: `GetSessions_OneEntryPerActiveFamily`, `GetSessions_RootCreatedAtSurvivesRotation`, `GetSessions_LastTokenIssuedAt_IsHeadCreatedAt_NotRootOrExpiry`, `GetSessions_OrderedByLastIssuedDesc_TiesStable`, `RevokeSession_ByRotatedId_RevokesActiveHead`, `RevokeSession_UnknownId_ReturnsFalse`, `RevokeSession_EndedFamily_ReturnsTrue`, `Rotate_CopiesUserAgent`, `AddRefreshToken_SixthSession_EvictsOldest_StillFiveActive`, `BelongsToSession_StaleProbe_True`, `UserAgent_LongerThan256_Truncated`
- [x] Run, expect FAIL; implement (family = chain by `ReplacedByTokenId`, walk predecessors for root & successors for revoke, bounded by token count like `HasActiveSuccessor`)
- [x] `dotnet tool restore`, then `dotnet dotnet-ef migrations add AddRefreshTokenUserAgent -p src/YSocial.Infrastructure -s src/YSocial.Api -o Persistence/Migrations` (form as in BG §7.4 / conventions §3.7; nullable column, max 256); run `ModelTests.Model_MatchesLatestMigrationSnapshot`, `SeederTests`
- [x] Commit `feat(identities): session families & user agent on refresh tokens`

### Task B3: sessions API + `sid` claim
**Files:** Modify `IJwtProvider.cs`, `JwtProvider.cs`, `IUserContext.cs`, `UserContext.cs`, `Login.cs`, `RefreshToken.cs`, `SwitchProfile.cs`, `IdentitiesController.cs`, `Program.cs`, `SessionConflictTests.cs`; Create `Models/SessionDto.cs`, `GetSessions/GetSessions.cs`, `RevokeSession/RevokeSession.cs`; Test `tests/YSocial.Api.IntegrationTests/Identities/SessionsTests.cs`
**Interfaces:** Produces
- `IJwtProvider.GenerateToken(User user, Account account, RefreshTokenId? sessionId = null): string` (claim `sid`); `IUserContext.SessionId: Guid` (Empty when absent)
- `LoginCommand(string LoginId, string Password, string DeviceId, string? UserAgent = null)` (controller sets from `Request.Headers.UserAgent`, never from body); login generates JWT AFTER `AddRefreshToken`
- `SessionDto(Guid Id, string? UserAgent, string? ProfileUsername, DateTime CreatedAt, DateTime LastTokenIssuedAt, bool IsCurrent)`
- `GetSessionsQuery : ResultQuery<IReadOnlyList<SessionDto>>`; `RevokeSessionCommand(Guid SessionId) : ResultCommand`
- `GET /api/identities/sessions` ([Authorize]) 200 | `DELETE /api/identities/sessions/{id:guid}` ([Authorize]) 204/404
- [x] RED integration tests: `List_AfterTwoLogins_TwoSessions_CurrentFlaggedByAccessToken`; `List_AfterRefresh_IsCurrentFollowsRotation`; `List_CapturesUserAgentHeader`; `List_Anonymous_401`; `Revoke_OtherSession_ItsRefreshReturns401_ItsAccessTokenStillWorksUntilExpiry`; `Revoke_StaleRotatedId_RevokesFamily`; `Revoke_EndedFamily_204`; `Revoke_ForeignAccountId_404`; `Revoke_UnknownId_404`; `Revoke_CurrentSession_OwnRefresh401`; `List_OrderAndTimestamps_MatchDomain` (DTO order = `GetSessions` order, `lastTokenIssuedAt` moves forward after refresh, `createdAt` does not)
  - **Race correctness (why it holds):** revoke & refresh both take `IAccountSessionLock` per account, load AFTER taking it & commit INSIDE it, so later one always reads earlier one's saved state; across instances `Account.Version` turns loser into 401 (refresh, D5) or 409 (revoke). Tests prove invariant, not timing:
    - deterministic order A: `Revoke_ThenRefreshSameToken_Returns401_ZeroActive`
    - deterministic order B: `Refresh_ThenRevokeWithStaleId_RevokesNewHead_ZeroActive`
    - deterministic lock wait: `Revoke_WaitsForHeldAccountLock` (test resolves `IAccountSessionLock` from host, holds it, starts revoke, awaits `IsCompleted == false` only after request provably reached handler via `TaskCompletionSource` signal, releases, request completes) following `AccountSessionLockTests` style
    - race: `RevokeVsRefresh_SameFamily_50xBarrier_NoActiveTokenSurvives` asserts ONLY order-independent invariant (0 active tokens in family; refresh is 200 or 401, revoke 204), so every interleaving is valid & no sleep decides result
  - `Switch_ReplayedRefreshToken_Returns401_NoSecondRotation` (pins at-most-once, property FE retry relies on); extend `SessionConflictTests`: `Revoke_ConcurrencyConflict_Maps409`
- [x] Run, expect FAIL; implement (revoke: lock first, load, `RevokeSession`, commit INSIDE lock, `ConcurrencyConflictException` left to `GlobalExceptionHandler` = 409; list: account from `IUserContext.AccountId`, `ProfileUsername` via `IUserRepository.GetUsersByIdsAsync`, deleted -> null)
- [x] Update `SessionConflictTests.cs:49` mock to `GenerateToken(Arg.Any<User>(), Arg.Any<Account>(), Arg.Any<RefreshTokenId?>())`
- [x] `dotnet test` full: all green; report ACTUAL counts per project vs baseline recorded in Task B0 (docs counts are stale, never copied as expectation)
- [x] Commit `feat(identities): list & revoke sessions, sid claim`

### Task B4: contract docs + generated FE types
**Files:** `.context/backend/integration/frontend-backend-mapping.md`, `.context/backend/architecture/{backend-guide,domain-model}.md`, `ysocial-clients/web-app/docs/swagger.json`, `src/lib/api/generated.ts`
- [x] MAP: §2.1 sessions rows + `DELETE account` FE column; §2.2 `me` row; §3 `MeDto`, `SessionDto`; §4 coverage (switcher Done, sessions Done, deactivate/reply-policy Unsupported); §7 D29, D30 (`lastTokenIssuedAt` naming, `Version` concurrency, wire-format asymmetry, revoked access token valid until expiry); status line test counts (ACTUAL from final `dotnet test`, not carried over)
- [x] BG: §6.1 `sid` claim, §6.3 table, §6.4 lock table (`revoke session` row + conflict outcome 409), §9/§10 (#26 note: sessions done), §11 counts; DM §2 `RefreshToken` row
- [x] Check BE can run against Postgres: `dotnet user-secrets list --project src/YSocial.Api` (connection string present); start API, then `npm run api:fetch`, `npm run api:generate`, `npm run api:check` expect clean; `Swagger_*` tests green
- [x] Commit `docs(settings): contract D29 D30 & regenerate FE types`

## Part 2 - Frontend

### Task F1: `settings-store` + effects (4.2)
**Files:** Create `features/settings/store/settings-store.ts`(+test), `components/settings-effects.tsx`(+test); Modify `app/providers.tsx`, `app/globals.css`
**Interfaces:** Produces `useSettingsStore` state `{ fontSize: "sm"|"md"|"lg"; reducedMotion: "system"|"reduce"; hideLikeCounts: boolean; hideShareCounts: boolean; actions: { setFontSize; setReducedMotion; setHideLikeCounts; setHideShareCounts } }`; selector hooks `useFontSize`, `useReducedMotion`, `useDisplayPrefs` (`useShallow`); `<SettingsEffects/>`; storage key `ysocial_settings_v1`
- [x] RED: `defaults are md/system/false/false`; `persist rehydrate restores values`; `skipHydration: first render uses defaults`; `SettingsEffects sets data-font-size & data-motion on html`; `system removes data-motion`
- [x] Implement with `persist({ skipHydration: true })`, `void useSettingsStore.persist.rehydrate()` in `Providers` layout effect (next to search store). CSS, every selector scoped:
  `html[data-font-size="sm"]{font-size:...}` `html[data-font-size="lg"]{...}`; `html[data-motion="reduce"] *, html[data-motion="reduce"] *::before, html[data-motion="reduce"] *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }`
- [x] Add CSS contract test (read `globals.css` text): no selector in motion block lacks `html[data-motion="reduce"]` prefix
- [x] Run `npm run test -- settings-store settings-effects`, `npm run typecheck`; commit `feat(settings): settings-store & appearance effects`

### Task F2: capabilities + optional section capability
**Files:** Modify `lib/capabilities.ts`(+test), `features/settings/types/index.ts`, `settings-nav.tsx`, `settings-index.tsx`(+`settings-nav.test.tsx`)
**Interfaces:** Produces `Capability` += `"accountUi" | "profileSwitcher"` (rule `(slices) => slices.has("auth")`); `SettingsSection.capability?: Capability` (absent = always shown); helper `visibleSections(): SettingsSection[]` in `constants.ts` used by nav & index
- [x] RED: capabilities test (unset = on, `none` = off, `auth` only = on); nav test: section without capability is shown in mock mode, one with `accountUi` hidden
- [x] Implement refactor only (no new sections yet); `npm run test`, `typecheck`; commit `feat(settings): optional section capability & auth-gated capabilities`

### Task F3: appearance + language sections
**Files:** Create `appearance-section.tsx`, `language-section.tsx` (+tests), pages `app/settings/(sections)/{appearance,language}/page.tsx`; Modify `settings-sections.tsx`, `constants.ts`, `index.ts`, `main-layout.tsx`(+`main-layout.test.tsx`), `settings-routes.test.tsx`, `lib/locales/{vi,en}.json`
- [x] RED: appearance: theme buttons call `setTheme`, font/motion write store; language: radio switches `ui-store` locale; routes test renders both titles; main-layout: dropdown no longer contains theme/language items (mobile language button kept only if still referenced elsewhere, decided by test)
- [x] Implement: section + route (metadata title/description) + `SETTINGS_SECTIONS` entries (no capability) + keys below; remove dropdown theme/language items in SAME task (replacement now exists)
- [x] i18n keys: `settings.appearance` Giao diện/Appearance, `settings.language` Ngôn ngữ/Language, `settings.onThisDevice` Chỉ áp dụng trên thiết bị này/Applies to this device only, `settings.theme` Chủ đề/Theme, `settings.themeLight` Sáng/Light, `settings.themeDark` Tối/Dark, `settings.fontSize` Cỡ chữ/Font size, `settings.fontSm` Nhỏ/Small, `settings.fontMd` Vừa/Medium, `settings.fontLg` Lớn/Large, `settings.reducedMotion` Giảm chuyển động/Reduced motion, `settings.motionSystem` Theo hệ thống/Follow system, `settings.motionReduce` Luôn giảm/Always reduce
- [x] `npm run test`, `typecheck`; commit `feat(settings): appearance & language sections`

### Task F4: content section + privacy links
**Files:** Create `content-section.tsx`(+test), page `content/page.tsx`; Modify `post-card.tsx`(+test), `privacy-settings.tsx`/`settings-sections.tsx`, `constants.ts`, `settings-routes.test.tsx`, locales
- [x] RED: switches write store; `PostCard` hides like count when `hideLikeCounts`, share count when `hideShareCounts` (owner `hideLikeCount` rules unchanged); privacy section renders links to `/settings/blocked` & `/settings/close-friends` (links hidden when their capability is off)
- [x] Keys: `settings.content` Nội dung/Content, `settings.hideLikeCounts` Ẩn số lượt thích/Hide like counts, `settings.hideShareCounts` Ẩn số lượt chia sẻ/Hide share counts, `settings.mutedLink` Danh sách đã ẩn/Muted accounts, `settings.privacyLinks` Danh sách chặn & bạn thân/Blocked & close friends
- [x] `npm run test`, `typecheck`; commit `feat(settings): content preferences & privacy links`

### Task F5: time-management section
**Files:** Create `utils/usage-tracker.ts`(+test), `time-management-section.tsx`(+test), page `time-management/page.tsx`; Modify `app/providers.tsx` (mount `<UsageTrackerMount/>`), `constants.ts`, routes test, locales
**Interfaces:** Produces `startUsageTracking(now?: () => number): () => void` (5s ticks only while `document.visibilityState === "visible"`, flush to `ysocial_usage_v1` every 30s & on `visibilitychange`, keep 30 days), `readUsage(): Record<string, number>` (key local `YYYY-MM-DD`, seconds), `dailyAverage(usage, days: number, today: string): number`
- [x] RED: hidden tab accrues nothing; ticks add 5s; 30-day prune; 7-day average ignores future dates; section renders today + 7 bars + average, empty state when no data
- [x] Keys: `settings.timeManagement` Quản lý thời gian/Time management, `settings.usageToday` Hôm nay/Today, `settings.usageAverage` Trung bình 7 ngày/7-day average, `settings.usageEmpty` Chưa có dữ liệu/No data yet
- [x] `npm run test`, `typecheck`; commit `feat(settings): time management section`

### Task F6: account section (real only)
**Files:** Create `services/account-service.ts`(+test), `utils/birth-date.ts`(+test), `account-section.tsx`(+test), page `account/page.tsx`; Modify `features/auth/services/auth-service.ts` (export `fetchMe`), `constants.ts` (capability `accountUi`), routes test, locales
**Interfaces:** Produces `fetchMe(): Promise<MeDto>`; `saveAccountProfile(me: MeDto, patch: { gender: GenderValue; dateOfBirth: string | null }): Promise<UserProfileDto>` (PUT `/api/users/profiles/me` with FULL current `displayName/bio/avatarUrl/coverUrl` + `gender` int + `dateOfBirth`); `toWireBirthDate(ymd: string): string` -> `${ymd}T00:00:00Z`; `GENDER_TO_INT = { unspecified: 0, male: 1, female: 2, other: 3 }`
- [x] RED: `toWireBirthDate` identical under `TZ=Asia/Ho_Chi_Minh` & `TZ=America/Los_Angeles` (vitest run twice with `TZ`); `saveAccountProfile sends full profile fields`; form prefilled from `fetchMe`; double click sends 1 request; success toast; birth date max = yesterday; mock mode -> `FeatureUnavailable`, no network call; guest -> existing gate
- [x] Keys: `settings.account` Tài khoản/Account, `settings.email` Email/Email, `settings.username` Tên người dùng/Username, `settings.usernameLocked` Không thể đổi/Cannot be changed, `settings.gender` Giới tính/Gender, `settings.genderUnspecified` Không nêu/Unspecified, `settings.genderMale` Nam/Male, `settings.genderFemale` Nữ/Female, `settings.genderOther` Khác/Other, `settings.birthDate` Ngày sinh/Birth date, `settings.save` Lưu/Save, `settings.saved` Đã lưu/Saved, `settings.saveFailed` Không lưu được/Could not save
- [x] `npm run test`, `typecheck`; commit `feat(settings): account section`

### Task F7: sessions section (real only)
**Files:** Create `utils/describe-user-agent.ts`(+test), `sessions-section.tsx`(+test), page `sessions/page.tsx`; Modify `account-service.ts` (`fetchSessions`, `revokeSession`), `constants.ts`, routes test, locales
**Interfaces:** Produces `fetchSessions(): Promise<SessionDto[]>`, `revokeSession(id: string): Promise<void>`, `describeUserAgent(ua: string | null): { browser: string; os: string } | null`
- [x] RED: current session has badge & no revoke button; revoke confirm -> `revokeSession` -> row removed; double click 1 request; failure toast keeps row; note text rendered that revoked device may stay signed in until its access token expires (<= 15 min); UA parsing table (Chrome/Edge/Firefox/Safari on Windows/macOS/Linux/Android/iOS, null -> unknown); mock mode -> `FeatureUnavailable`
- [x] Keys: `settings.sessions` Phiên đăng nhập/Sessions, `settings.sessionCurrent` Thiết bị này/This device, `settings.sessionSignedIn` Đăng nhập lúc/Signed in, `settings.sessionTokenIssued` Cấp token lần cuối/Token last issued, `settings.sessionRevoke` Đăng xuất phiên/Sign out session, `settings.sessionRevokeConfirm` Đăng xuất phiên này?/Sign out this session?, `settings.sessionRevokeNote` Thiết bị đó có thể vẫn dùng được tối đa 15 phút cho đến khi token hết hạn/That device may keep working for up to 15 minutes until its token expires, `settings.sessionUnknownDevice` Thiết bị không xác định/Unknown device
- [x] `npm run test`, `typecheck`; commit `feat(settings): sessions section`

### Task F8: danger section (real only)
**Files:** Create `danger-section.tsx`(+test), page `danger/page.tsx`; Modify `account-service.ts` (`deleteAccount`), `constants.ts`, routes test, locales
- [x] RED: typing different username shows error & sends nothing (button stays enabled); matching username -> `deleteAccount` -> `clearAuth` + `router.push("/login")`; double click 1 request; failure toast keeps session; mock mode unavailable
- [x] Keys: `settings.danger` Vùng nguy hiểm/Danger zone, `settings.deleteAccount` Xoá tài khoản/Delete account, `settings.deleteAccountWarn` Hành động này không thể hoàn tác/This cannot be undone, `settings.deleteAccountType` Nhập tên người dùng để xác nhận/Type your username to confirm, `settings.deleteAccountConfirm` Xoá vĩnh viễn/Delete forever (no deactivate wording anywhere)
- [x] `npm run test`, `typecheck`; commit `feat(settings): delete account section`

### Task F9: profile switcher (2.7)
**Files:** Modify `lib/token-refresh.ts`(+test), `features/auth/services/auth-service.ts`(+test), `features/auth/types/index.ts`, `features/auth/index.ts`, `features/posts/store/post-store.ts`(+test), `features/profile/components/viewer-sync.tsx`(+test), `features/notifications/components/notification-live-sync.test.tsx`, `features/settings/components/notification-settings.test.tsx`, `components/layout/main-layout.tsx`; Create `features/auth/components/profile-switcher.tsx`(+test); locales `nav.switchProfile` Chuyển hồ sơ/Switch profile, `nav.switchFailed` Không chuyển được hồ sơ/Could not switch profile, `nav.switchUnconfirmed` Chưa xác nhận được việc chuyển; nếu bị đăng xuất hãy đăng nhập lại/Could not confirm switch; sign in again if you are signed out, `nav.switchSessionLost` Phiên đã hết hiệu lực, vui lòng đăng nhập lại/Session expired, please sign in again
**Interfaces:** Produces
- `withRefreshLock<T>(fn: () => Promise<T>, deps?: RefreshDeps): Promise<T>` & exported `rotateTokens(sentAccessToken: string | null, deps?: RefreshDeps): Promise<RefreshOutcome>` (today's private `rotate`, unlocked) in `token-refresh.ts`; `refreshTokens` unchanged
- `authService.switchProfile(target: ProfileSummary): Promise<AuthUser>`; errors `SwitchSessionLostError`, `SwitchUnconfirmedError`; `ProfileSummary = Schemas["ProfileSummaryDto"]`; `authUserFromSummary(summary: ProfileSummary, email: string): AuthUser`
- `PostStoreActions.resetViewerFlags: () => void` (sets `isLikedByCurrentUser` & `isBookmarkedByCurrentUser` false on every cached post)
- `<ProfileSwitcher/>` in account dropdown: loads `fetchMe` when opened, shows OTHER profiles only when `profiles.length > 1`, capability `profileSwitcher`
- [x] RED `token-refresh.test`: `withRefreshLock serializes with refreshTokens`; `rotateTokens inside withRefreshLock does not deadlock`; with NON-re-entrant lock fake, calling `refreshTokens` inside `withRefreshLock` hangs (documents why switch must not)
- [x] RED `auth-service.test` (real adapter, injected non-re-entrant lock fake + fetch stub):
  - clean path: `switchProfile commits tokens & summary-derived user in 1 step`; `adopts tokens rotated by another tab before PUT`
  - expired access token: PUT answers 401 `Unauthenticated` -> `rotateTokens` once -> retry PUT once; assert `refreshTokens` & `apiClient` never called & test finishes under fake's hang guard
  - after commit: `GET me failure keeps new tokens & summary-derived user`
  - definitive failures: `403 ProfileNotOwned leaves tokens untouched & rejects`; `401 InvalidRefreshToken clears auth`
  - PRE-SEND failures: `no stored refresh token`, `rotateTokens transient`: state untouched, no retry, plain error
  - AMBIGUOUS failures (network error, 15s abort, HTTP 5xx): `retries same PUT once; retry success commits`; `retry 401 InvalidRefreshToken -> SwitchSessionLostError + clearAuth`; `second ambiguous failure -> SwitchUnconfirmedError, state untouched`
  - `switch racing refresh in another lock holder: exactly 1 rotation`
  - adoption & cross-tab persistence: `reads tokens from localStorage inside lock, ignores stale Zustand`; `localStorage holds NEW pair & user before lock is released` (queued `refreshTokens` then adopts new pair, makes no network call); `no rotation when access token is still valid` (rotate only after 401 `Unauthenticated`); `another tab mirrors tokens + user via storage sync & ends consistent`; failure paths leave `localStorage` byte-identical to before; `no navigator.locks: switch & in-tab refresh serialize through shared chain`
- [x] RED `viewer-sync.test`: on viewer change calls `resetViewerFeeds`, `resetViewerFlags`, `invalidateViewerProjection(new)`, `ensureFollowGraph(new)`, `ensureRelationSets(new, force)`; late follow-graph answer & late relation-sets answer for A resolve AFTER switch to B & leave B's `useFollowedIds`/relation slots unchanged (per-actor slots + generation); cross-tab `storage` event with different user triggers same path
- [x] RED isolation (guards exist; tests prove them, NO new reset mechanism): `notification-store.test`: list/count/loadMore answers started under A are dropped after `resetNotificationStore` (generation); `notification-preferences-store.test`: A's late `loadPreferences`/save answer never writes B (generation); `notification-live-sync.test`: switch stops hub before second `start` & resets; `notification-settings.test`: preferences refetched for B while page stays mounted; `saved-list.test`: A's late saved answer after viewer change does not render (key remount + `cancelled`); `post-store.test`: `resetViewerFlags` only touches two flags
- [x] RED `profile-switcher.test`: hidden with 1 profile & in mock mode; click switches & calls `router.refresh()`; toasts per error class (`switchFailed`, `switchUnconfirmed`, `switchSessionLost` + redirect `/login`); double click 1 request
- [x] Implement per spec §4.3 (amended by P0); PUT uses raw `fetch` with `AbortSignal.timeout(15_000)` inside `withRefreshLock`, never `apiClient`; mock-session cookie via `updateUser`
- [x] `npm run test`, `typecheck`, `lint`; commit `feat(auth): profile switcher with race-safe token rotation`

### Task F10: verify, docs, close
- [x] Re-run Task B0 command set; report actual counts & delta vs baseline (never expected number). `npm run api:update` is documented generation path (`api:fetch` + `api:generate`), then `api:check` must be clean & `git status` must show no uncommitted generated drift
- [x] Real-BE smoke in Browser pane (`preview_start`): login `test@example.com`; account save (gender, birth date survives reload, UTC+7 machine); second login in another context -> sessions list shows 2 -> revoke it -> list drops it, its `POST refresh-token` returns 401 `InvalidRefreshToken` & its current access token still answers 200 until expiry (D6, expected); switch to `TestUserAlt` (viewer-scoped data changes, notifications hub restarts, preferences refetched); delete-account on throwaway registered account; 375/768/1440 px, light/dark, keyboard focus (PASS, see `.context/features/settings.md` Verification status; 375/768 px, dark mode, keyboard focus NOT verified in real-BE run)
- [x] Mock-mode smoke (done in Browser pane + `next build`; found & fixed missing `"use client"` on `use-submit-guard`) (`NEXT_PUBLIC_REAL_API_SLICES=none`): FE-only sections work, real-only hidden, no network call to BE
- [x] Docs per `00-agentic-rules.md` §4: create `.context/features/settings.md` (as-built, pitfalls incl. lock re-entry, ambiguous switch recovery), update `relationship-controls.md` (settings shell), `backend/integration/fe-be-integration.md` (switcher/lock rule, link only), roadmap (tick 4.1, 4.2, 2.7; deferrals reply/mention policy + deactivate under Open items), `.context/INDEX.md` line, spec/plan mismatch logs
- [x] Deferred minor triage (§4.3): resolve / defer / close each, report
- [x] Commit `docs(settings): as-built, roadmap & index`

## Mismatch log (pre-noted)
- Spec §4.3 "central registry" replaced by `ViewerSync` as single subscriber (P0 amends spec)
- B0 baseline (Windows, branch feat/settings-hub @ 0005738): BE Domain 77 / Application 73 / API integration 468, 0 failed 0 skipped (docs say 60/73/430: stale). FE: vitest 109 files / 1303 tests passed, typecheck clean, lint 0 errors 12 warnings (`no-img-element`). `api:check` FAILS on baseline ONLY because working copy `generated.ts` is CRLF (autocrlf) while generator emits LF; content identical when CR stripped. Ruling: compare CR-insensitively locally; git stores LF, so no committed drift
- Postgres user-secret present (cloud Aiven); B4 ran API with `Database__AutoMigrate=false` & `SeedData=false` (swagger needs no DB), so cloud DB was NOT touched; real-BE smoke needs migration `AddRefreshTokenUserAgent` applied there (asked, not done)
- Execution rulings & deviations: see spec §6 (as-built list) & SDD ledger; final counts BE 88 / 74 / 494 (baseline 77 / 73 / 468), FE vitest 126 files / 1451 tests (baseline 109 / 1303), typecheck clean, lint 0 errors / 12 warnings (baseline equal), `next build` OK (mock slices)
- Final review (Opus, fresh): 0 Critical, 3 Important: #1 replay as another profile after switch (FIXED), #2 ambiguous retry meeting expired access token (FIXED), #3 unbounded token chains (BG §10 #28, not fixed)
- Deferred minor triage (resolve / defer / close): final register in `.context/features/settings.md` Deferred; resolved: date error `aria-describedby`, vacuous `refreshSpy`, test rename `Revoke_ConcurrencyConflict_Throws`, MAP purged-family wording
- Real-BE smoke: migration `AddRefreshTokenUserAgent` applied to shared cloud DB with user go-ahead; seed `test_user` now keeps birth date 2000-01-31 (BE cannot clear), gender reset to unspecified; throwaway account deleted
