---
module: Settings hub, Account & Profile switcher (FE + BE) - roadmap Phase 4 + 2.7
updated: 2026-10-21
spec: docs/specs/2026-10-21-settings-account-design.md
plan: docs/plans/2026-10-21-settings-account.md
---

# Settings hub, account & profile switcher

9 FE-only/real sections under `/settings` + profile switcher in account menu. FE-only sections work in every mode; account, sessions, danger & switcher need real identity (capability `accountUi` / `profileSwitcher` = auth slice real, no mock adapter). Contract: MAP D29 (owner demographics), D30 (sessions)

## Routes
| Route | Content | Gate |
|---|---|---|
| `account` | email & username read-only, gender, birth date; Save | `accountUi` |
| `privacy` | private account, follow requests, links to `blocked` & `close-friends` | `privacyUi` (links: `blockUi`, `closeFriendsUi`) |
| `notifications` | per-kind switches (server state, per profile) | `notificationSettings` |
| `blocked`, `muted`, `close-friends` | relation lists | own capability |
| `appearance` | theme light/dark/system, font size, reduced motion | none |
| `language` | vi / en (native names) | none |
| `content` | link to `muted`, hide like / share counts | none (link: `muteUi`) |
| `time-management` | today, 7 days, daily average | none |
| `sessions` | device list, remote sign-out | `accountUi` |
| `danger` | delete account (type username) | `accountUi` |

- Roadmap's `liked` route is `content` (nothing about likes received). Guards: `SettingsGuestGate` in root settings layout (guest -> login CTA); capability decides availability, sections never treat it as auth
- `SettingsSection.capability` optional, `visibleSections()` filters nav & index per call. Order: account, privacy group, appearance, language, content, time-management, sessions, danger

## Data flow
```
settings-store (persist, skipHydration) -> SettingsEffects -> <html data-font-size data-motion> -> globals.css
usage-tracker (5s ticks, flush 30s) -> ysocial_usage_v1 -> TimeManagementSection (useSyncExternalStore)
GET me -> useViewerResource -> AccountForm -> PUT profiles/me (full profile + gender + birth date)
GET sessions -> SessionList -> DELETE sessions/{id}
ProfileSwitcher (menu opens) -> GET me -> authService.switchProfile -> switch-profile.ts -> replaceSession
```

## Stores & device scope
- `settings-store` (`features/settings/store`): `fontSize sm|md|lg`, `reducedMotion system|reduce`, `hideLikeCounts`, `hideShareCounts`; key `ysocial_settings_v1`; `skipHydration`, `Providers` rehydrates after mount; persisted shape validated (user-editable). Theme stays `next-themes` (`enableSystem` on, default stays dark), locale stays `ui-store`
- Everything here lives in localStorage, per DEVICE (survives profile switch & logout, UI says "on this device"). Server-side per-profile state (notification preferences, D27) is NOT here
- `reduce` forces reduced motion; `system` leaves OS `prefers-reduced-motion` alone (no `off`). CSS: every `data-motion` selector is scoped `html[data-motion="reduce"]` (test reads `globals.css`)
- Display prefs hide counts in `PostCard` for every viewer; per-post owner `hideLikeCount` (capability `hideLikeCount`) is separate & unchanged. `post-card` imports the store by deep path (barrel import created a cycle posts -> settings -> profile -> posts that broke `search-box` tests)
- `usage-tracker`: visible-tab seconds per local day, `readUsage`/`dailyAverage`/`usageForLastDays`, flushes ADD to stored values (several tabs sum), keeps 30 days; average = total of last 7 days / 7; today comes from the snapshot string (`<today>|<raw>`) so render stays pure

## Account (D29)
- `fetchMe` (auth-service) -> `MeDto { profile, email, profiles, gender, dateOfBirth }`; `saveAccountProfile` sends FULL `displayName/bio/avatarUrl/coverUrl` (BE replaces them) + gender int (`GENDER_TO_INT`) + `dateOfBirth`
- Wire: request `dateOfBirth` = `${yyyy-MM-dd}T00:00:00Z` string concat (`toWireBirthDate`), response = `yyyy-MM-dd`; tests under `TZ=Asia/Ho_Chi_Minh` & `TZ=America/Los_Angeles`
- Birth date max = yesterday (local), min 1900; BE reads a missing/null `dateOfBirth` as "keep stored", so a stored one can be changed but NOT cleared: form requires it once stored
- Save stays enabled + inline spinner, `useSubmitGuard`; form data captured when it opens (last write wins)

## Sessions (D30)
- `fetchSessions` maps generated `SessionDto` (all optional) to strict `SessionItem`; BE order kept (newest token issue first). Current device = badge, no revoke button
- Labels: "Signed in" (`createdAt`) & "Token last issued" (`lastTokenIssuedAt`), never "active". Confirm dialog states revoked device may work up to 15 min (access token valid until expiry, D6)
- Revoke 404 = already gone (row dropped); other failure = toast, row kept; dialog stays open during request
- `describeUserAgent`: browser + OS from UA string (Edge/Opera/Firefox/Chrome/Safari x Windows/Android/iOS/macOS/Linux), `null` = "unknown device"

## Danger
- Delete only (no deactivate: login rejects inactive accounts, no reactivation path, BG §10 #26). AlertDialog + type username (case-insensitive, same fallback as profile link), then `deleteAccount` -> `clearAuth` + `/login`; mismatch or failure keeps dialog, session kept

## Profile switcher (2.7)
- `ProfileSwitcher` in `MainLayout` account menu: loads `GET me` when menu opens (`useCachedResource`, key per viewer), lists OTHER profiles only when account has > 1; capability `profileSwitcher`
- **Lock rule:** `navigator.locks` is NOT re-entrant and `apiClient` refreshes on 401 through the same lock. `switch-profile.ts` runs inside `withRefreshLock` and uses ONLY raw `fetch` + unlocked `rotateTokens`; never `refreshTokens`/`apiClient` there (test with non-re-entrant lock fake proves the hang). No locks -> one in-tab promise chain shared with `refreshTokens`
- Inside lock: tokens read from localStorage (cross-tab truth) -> `PUT profiles/switch` with stored access token. 401 `InvalidRefreshToken` = refresh dead; ANY other 401 = access rejected: `rotateTokens` once, mirror rotated pair to store + localStorage at once (old pair is dead whatever happens next), retry PUT once
- **At-most-once:** the PUT consumes the single-use refresh token (replay = 401, never a second switch). Lost response cannot give exactly-once: new tokens exist only in it
- Failure classes: PRE-SEND (incomplete summary, no stored tokens, rotation transient) = clean, plain error. AMBIGUOUS (no HTTP answer, 15s timeout, 5xx, 200 without tokens) = retry SAME PUT once; retry 401 `InvalidRefreshToken` -> `SwitchSessionLostError` (`clearAuth`, toast, `/login`); second ambiguous -> `SwitchUnconfirmedError` (state untouched). DEFINITIVE: 403 `ProfileNotOwned` -> toast, tokens untouched; 401 `InvalidRefreshToken` re-reads storage first (another tab rotated = clean failure, no `clearAuth`)
- **Commit:** `auth-store.replaceSession(access, refresh, user)` = 3 storage writes + cookie + ONE `set`, inside the lock before release (a waiting refresher adopts the NEW pair). User = `authUserFromSummary(ProfileSummaryDto, email)`; `GET me` afterwards (outside lock) only refreshes snapshot, applied only while viewer id still matches, failure changes nothing
- Module-level guard `SwitchInProgressError` (menu unmounts on select, a component guard alone would not hold); pre-send checks run before the lock
- **Viewer reset:** `ViewerSync` is the single viewer-change subscriber: viewer generation, `resetViewerFeeds`, `resetViewerFlags` (like/bookmark flags of cached posts, new), follow projection, relation sets. Already viewer-scoped before this phase: `NotificationLiveSync` (hub stop -> start, store reset), `SavedList key={viewerId}`, notification preferences (`NotificationSettings` effect keyed by viewer), follow graph & relation sets stored per actor id. After success `router.refresh()`; mock-session cookie via store

## Key rules
- No `any`, flat i18n keys, native `<select>`/radios (no Select primitive), Lucide only, bars drawn as SVG `rect` (no inline CSS)
- Real-only sections check `hasCapability("accountUi")` in a thin wrapper before any hook that fetches (mock mode makes no request)
- `useViewerResource(load)`: viewer + retry keyed, answers for older keys dropped, no synchronous setState in effect

## Pitfalls
- **RSC boundary:** barrel `features/auth/index.ts` is imported by Server Components (`app/login/page.tsx`); every file it re-exports that imports React hooks needs `"use client"` (`use-submit-guard.ts` was missing it: typecheck, lint & Vitest were green, only `next dev` showed the error). Verify new barrel exports in a real build
- **Lint `react-hooks/purity`:** `Date.now()` in render fails lint (committed once, fixed next commit)
- **Test env default is mock** (`vitest.setup.ts` sets `NEXT_PUBLIC_REAL_API_SLICES=none`): auth-gated sections are absent from default nav/index tests; use `setRealSlices`
- **`api:check` on Windows:** working copy `generated.ts` is CRLF (autocrlf) while the generator emits LF, so `--check` fails with identical content; git stores LF. Compare CR-insensitively
- **jsdom + Radix:** with a controlled-open menu/dialog a "double click" hits twice (nothing unmounts); the guarantee comes from the service-level guard

## Deferred
- Reply / mention policy (no account policy, no mention model), deactivate (see Danger), username/email change, create profile, real device names (UA string only)
- Shared `safeStorage` helper is duplicated in `search-store` & `settings-store` (extract later)
