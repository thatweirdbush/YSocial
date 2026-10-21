---
module: Settings hub, Account & Profile switcher (FE + BE) - roadmap Phase 4 + 2.7
updated: 2026-10-21
spec: docs/specs/2026-10-21-settings-account-design.md
plan: docs/plans/2026-10-21-settings-account.md
---

# Settings hub, account & profile switcher

Sections under `/settings` + profile switcher in account menu. FE-only sections work in every mode; `account`, `sessions`, `danger` & switcher need real identity (capability `accountUi` / `profileSwitcher` = `auth` slice real, no mock adapter)
- Contract owner: MAP (D29 owner demographics, D30 sessions, wire formats, error codes)
- BE behavior owner: BG §6 (session lock, `sid`, revoke)

## Routes
| Route | Content | Gate |
|---|---|---|
| `account` | email & username read-only, gender, birth date, Save | `accountUi` |
| `privacy` | private account, follow requests, links to `blocked` & `close-friends` | `privacyUi` (links: `blockUi`, `closeFriendsUi`) |
| `notifications` | per-kind switches (server state, per profile) | `notificationSettings` |
| `blocked`, `muted`, `close-friends` | relation lists | own capability |
| `appearance` | theme light/dark/system, font size, reduced motion | none |
| `language` | vi / en (native names) | none |
| `content` | link to `muted`, hide like / share counts | none (link: `muteUi`) |
| `time-management` | today, 7 days, daily average | none |
| `sessions` | device list, remote sign-out | `accountUi` |
| `danger` | delete account (type username) | `accountUi` |

- Roadmap's `liked` route = `content` (nothing about likes received)
- **Guards:** `SettingsGuestGate` in root settings layout (guest -> login CTA); capability decides availability, sections NEVER treat it as auth
- `SettingsSection.capability` optional; `visibleSections()` filters nav & index per call; order: account, privacy group, appearance, language, content, time-management, sessions, danger

## Data flow
```
settings-store (persist, skipHydration) -> SettingsEffects -> <html data-font-size data-motion> -> globals.css
usage-tracker (5s ticks, flush 30s) -> ysocial_usage_v1 -> TimeManagementSection (useSyncExternalStore)
GET me -> useViewerResource -> AccountForm -> PUT profiles/me (full profile + gender + birth date)
GET sessions -> SessionList -> DELETE sessions/{id}
ProfileSwitcher (menu opens) -> GET me -> authService.switchProfile -> switch-profile.ts -> replaceSession
```

## Stores & device scope
- `settings-store` (`features/settings/store`): `fontSize sm|md|lg`, `reducedMotion system|reduce`, `hideLikeCounts`, `hideShareCounts`; key `ysocial_settings_v1`; `skipHydration`, `Providers` rehydrates after mount; persisted shape validated (user-editable)
- Theme stays `next-themes` (`enableSystem` on, default dark); locale stays `ui-store`
- **Device scope:** all state here lives in localStorage per DEVICE (survives profile switch & logout; UI says "on this device"). Server-side per-profile state (notification preferences, D27) NEVER lives here
- `reduce` forces reduced motion; `system` leaves OS `prefers-reduced-motion` alone (no `off`: forcing motion over OS request breaks a11y). CSS: every `data-motion` selector scoped `html[data-motion="reduce"]` (test reads `globals.css`)
- Display prefs hide counts in `PostCard` for every viewer; per-post owner `hideLikeCount` (capability `hideLikeCount`) stays separate. `post-card` imports store by deep path (barrel import created cycle posts -> settings -> profile -> posts that broke `search-box` tests)
- `usage-tracker`: visible-tab seconds per local day; `readUsage`/`dailyAverage`/`usageForLastDays`; flushes ADD to stored values (several tabs sum); keeps 30 days; average = total of last 7 days / 7; today comes from snapshot string (`<today>|<raw>`) so render stays pure

## Account (D29)
- `fetchMe` (auth-service) -> `MeDto { profile, email, profiles, gender, dateOfBirth }`
- `saveAccountProfile` sends FULL `displayName/bio/avatarUrl/coverUrl` (BE replaces them) + `gender` int (`GENDER_TO_INT`) + `dateOfBirth`
- Request `dateOfBirth` = `${yyyy-MM-dd}T00:00:00Z` string concat (`toWireBirthDate`), no `Date` object; tests run under `TZ=Asia/Ho_Chi_Minh` & `TZ=America/Los_Angeles`
- Birth date max = yesterday (local), min 1900; BE reads missing/null as "keep stored", so stored value can change but NOT be cleared: form requires it once stored
- Save stays enabled + inline spinner, `useSubmitGuard`; form data captured when it opens (last write wins)
- Date error linked by `aria-describedby` (id `account-birth-date-error`)

## Sessions (D30)
- `fetchSessions` maps generated `SessionDto` (all optional) to strict `SessionItem`; BE order kept (newest token issue first); current device = badge, no revoke button
- Labels: "Signed in" (`createdAt`), "Token last issued" (`lastTokenIssuedAt`), NEVER "active"; confirm dialog states revoked device may work up to 15 min (D6)
- Revoke 404 = already gone (row dropped); other failure = toast, row kept; dialog stays open during request
- `describeUserAgent`: browser + OS from UA string (Edge/Opera/Firefox/Chrome/Safari x Windows/Android/iOS/macOS/Linux); `null` = "unknown device"

## Danger
- Delete only (no deactivate: login rejects inactive accounts, no reactivation path, BG §10 #26)
- AlertDialog + type username (case-insensitive, same fallback as profile link) -> `deleteAccount` -> `clearAuth` + `/login`; mismatch or failure keeps dialog & session

## Profile switcher (2.7)
- `ProfileSwitcher` in `MainLayout` account menu: loads `GET me` when menu opens (`useCachedResource`, key per viewer); lists OTHER profiles only when account has > 1; capability `profileSwitcher`
- **Lock rule:** `navigator.locks` is NOT re-entrant & `apiClient` refreshes on 401 through same lock. `switch-profile.ts` runs inside `withRefreshLock` with ONLY raw `fetch` + unlocked `rotateTokens`; NEVER `refreshTokens`/`apiClient` there (non-re-entrant lock fake in tests hangs if violated). No locks -> 1 in-tab promise chain shared with `refreshTokens`
- **Inside lock:** tokens read from localStorage (cross-tab truth) -> `PUT profiles/switch` with stored access token. 401 `InvalidRefreshToken` = refresh dead; ANY other 401 = access rejected: `rotateTokens` once, mirror rotated pair to store + localStorage at once (old pair dead whatever happens next), retry PUT once
- **At-most-once:** PUT consumes single-use refresh token (replay = 401, never 2nd switch); lost response cannot give exactly-once (new tokens exist only in it)
- **Failure classes:**
  - PRE-SEND (incomplete summary, no stored tokens, rotation transient): clean, plain error
  - AMBIGUOUS (no HTTP answer, 15s timeout, 5xx, 200 without tokens): retry SAME PUT once; retry 401 `InvalidRefreshToken` -> `SwitchSessionLostError` (`clearAuth`, toast, `/login`); 2nd ambiguous -> `SwitchUnconfirmedError` (state untouched)
  - DEFINITIVE: 403 `ProfileNotOwned` -> toast, tokens untouched; 401 `InvalidRefreshToken` re-reads storage first (another tab rotated = clean failure, no `clearAuth`)
- **Commit:** `auth-store.replaceSession(access, refresh, user)` = 3 storage writes + cookie + ONE `set`, inside lock before release (waiting refresher adopts NEW pair). User = `authUserFromSummary(ProfileSummaryDto, email)`; later `GET me` (outside lock) only refreshes snapshot, applied only while viewer id still matches, failure changes nothing
- Module-level guard `SwitchInProgressError` (menu unmounts on select, component guard alone would not hold); pre-send checks run before lock
- **Viewer reset:** `ViewerSync` = single viewer-change subscriber: viewer generation, `resetViewerFeeds`, `resetViewerFlags` (like/bookmark flags of cached posts), follow projection, relation sets. Already viewer-scoped: `NotificationLiveSync` (hub stop -> start, store reset), `SavedList key={viewerId}`, notification preferences (`NotificationSettings` effect keyed by viewer), follow graph & relation sets (per actor id). After success `router.refresh()`

## Key rules
- No `any`, flat i18n keys, native `<select>`/radios (no Select primitive), Lucide only, bars drawn as SVG `rect` (no inline CSS)
- Real-only sections check `hasCapability("accountUi")` in thin wrapper before any fetching hook (mock mode makes no request)
- `useViewerResource(load)`: viewer + retry keyed, answers for older keys dropped, no synchronous setState in effect

## Verification status
- **Real-BE smoke (2026-10-21, Windows UTC+7, BE over http, cloud PostgreSQL):** PASS for account save (gender + birth date survive reload), sessions list & revoke (UI + API: revoked refresh = 401 `InvalidRefreshToken`, its access token still 200), profile switch to `test_user_alt` (PUT 200, store + localStorage user consistent), delete account on throwaway (mismatch sends nothing, match -> 204 -> `/login`, login afterwards 401 `InvalidCredentials`)
- **Not verified:** 375/768 px, dark mode, keyboard focus in real-BE run (Browser pane unstable: viewport resets, screenshot timeouts); covered only by unit tests & mock-mode smoke

## Pitfalls
- **RSC boundary:** barrel `features/auth/index.ts` is imported by Server Components (`app/login/page.tsx`); every re-exported file importing React hooks needs `"use client"` (`use-submit-guard.ts` lacked it: typecheck, lint & Vitest green, only `next dev` failed). Verify new barrel exports in real build
- **Lint `react-hooks/purity`:** `Date.now()` in render fails lint
- **Test env default is mock** (`vitest.setup.ts` sets `NEXT_PUBLIC_REAL_API_SLICES=none`): auth-gated sections absent from default nav/index tests; use `setRealSlices`
- **`api:check` on Windows:** working copy `generated.ts` is CRLF (autocrlf), generator emits LF, so `--check` fails with identical content; git stores LF. Compare CR-insensitively
- **jsdom + Radix:** controlled-open menu/dialog "double click" hits twice (nothing unmounts); guarantee comes from service-level guard
- **Real-BE smoke on shared cloud DB:** run BE with `Database__AutoMigrate=true Database__SeedData=false` (seed holds well-known passwords); `PUT profiles/me` on seed `test_user` leaves birth date set (cannot clear), reset gender explicitly. Browser pane needs BE over http (`ASPNETCORE_URLS`, `NEXT_PUBLIC_API_BASE_URL`) to avoid dev cert trust

## Deferred (single owner of settings deferrals; roadmap links here)
| Item | Why | Next action |
|---|---|---|
| Reply / mention policy | no account policy, no mention model (BG §9) | BE design first |
| Deactivate account | login rejects inactive accounts, no reactivation (BG §10 #26) | BE design first |
| Username / email change, create profile, real device names | out of scope | product decision |
| Clear stored birth date | BE reads null as keep stored | BE: explicit clear semantic in `PUT profiles/me` |
| Unbounded token chains, quadratic session walk | BG §10 #28 | BE cleanup job |
| 403 `ProfileNotOwned` does not refetch `GET me` at once | menu unmounts; next opening reloads | none unless UX complaint |
| Mobile has no settings entry nor switcher | account menu desktop-only (pre-existing) | mobile nav design |
| Account menu clipped at ~364 px viewport height (smoke) | menu opens upward, items above viewport | menu placement fix (collision padding) |
| Duplicate `GET me` / `relation-sets` calls on home (smoke) | seen once in dev, cause not investigated (likely StrictMode) | verify in prod build |
| `safeStorage` helper duplicated in `search-store` & `settings-store` | cross-feature refactor | extract to `src/lib` |
| Post-card like rollback after switch can flip viewer B's flag | needs op-ledger design | with next viewer-scope work |
| Revoke 409 not retried in FE | rare multi-instance race | toast retry |
| Account save re-sends snapshot profile fields | last write wins, documented | refetch before PUT if conflicts appear |
| Font size px vs browser default + first-paint flash | needs `rem` scale + inline init script | polish phase 7 |
| a11y: device name in revoke dialog, switch progress announcement | polish | phase 7.5 |
| Tokens without `sid` show no current device | old tokens expire <= 15 min | none |
| Revoke of purged family = 404 (cap eviction) | same as unknown id, no probing | none (MAP wording fixed) |

Closed: static Vietnamese route metadata (existing pattern), 2 visible windows of 1 device both count usage, FE birth-date max vs BE `UtcNow.Date` (local yesterday never exceeds UTC today), vacuous `refreshSpy` assertion (removed, lock fake proves rule), `Revoke_ConcurrencyConflict_Maps409` name (renamed `..._Throws`), date error `aria-describedby` (fixed)
