---
module: FE-BE Integration Plan CP0-CP1
updated: 2026-10-16
status: draft
---

# FE-BE INTEGRATION: CP0 (plumbing) & CP1 (auth)

- Goal: first real FE -> BE calls; validate frozen contract end to end before more BE features
- Contract owner: `../integration/frontend-backend-mapping.md` (MAP); debt register: `../architecture/backend-guide.md` §10
- Scope: FE repo `ysocial-clients/web-app` only; BE changes ONLY when a contract mismatch is found (fix BE or MAP, never silently patch FE)
- Out of scope: CP2-CP4 slices stay on mocks

## 1. Principles
- **One slice at a time:** mock service stays default; real service behind env flag `NEXT_PUBLIC_USE_REAL_API` per feature, removed after slice is stable
- **Contract first:** mismatch found -> record in §5, decide BE vs FE fix, update MAP
- **Evidence:** each task = manual smoke against `dotnet run` (Development seed) + FE tests (Vitest) for pure logic

## 2. Tasks

### CP0 - plumbing
| Id | Task | Done when |
|---|---|---|
| I0.1 | BE run recipe: start BE (`https://localhost:49895`), trust dev cert, CORS origin `http://localhost:3000` | FE `fetch` from browser succeeds, no CORS error |
| I0.2 | Wire `src/lib/api-client.ts`: base URL from env, `Authorization` header, JSON handling | health call (`GET /api/feed?tab=forYou`) returns 200 in browser |
| I0.3 | ProblemDetails normalizer: parse `code`, `status`, `errors` (MAP §1, §1.1); typed `ApiError` | unit tests: each error class (400 `errors`, 401, 403, 404, 409, 500) |
| I0.4 | JWT decoder: read `user_id` (actor) & `sub` (never to social routes) | unit test with sample token |
| I0.5 | Regenerate `generated.ts` from current `swagger.json`; accept `null` for nullable DTO fields | typecheck green |

### CP1 - auth
| Id | Task | Done when |
|---|---|---|
| I1.1 | Register with `username` (`^[a-z0-9._]{3,30}$`); handle 409 `EmailTaken`/`UsernameTaken`, 400 `errors` map | register -> login works against BE |
| I1.2 | Login (`loginId` email/phone/username, `deviceId`); 401 `InvalidCredentials`, 403 `AccountInactive`; store tokens, bootstrap viewer via `GET /api/users/me` | `auth-store` holds viewer from `MeDto` |
| I1.3 | Silent refresh with **cross-tab single-flight** (`navigator.locks`/BroadcastChannel; re-read stored token after lock, skip if rotated); failure -> logout | test: 2 tabs refresh same token -> 1 call, no logout |
| I1.4 | Fix refresh-failure redirect `/auth/login` -> `/login` | manual |
| I1.5 | Logout (`refreshToken` body, always 204) clears all tabs | manual, 2 tabs |
| I1.6 | Forgot/reset flow (`forgot-password` 204; OTP read from BE dev log); 400 `InvalidOtp`/`OtpAttemptsExceeded` | reset -> login with new password |
| I1.7 | Post delete via `DELETE /api/posts/{id}` (needs real post id from BE) | 204, second call 404 handled |
| I1.8 | Restart behavior: BE restart wipes state -> refresh 401 -> clean logout | manual |

## 3. Order
- I0.1 -> I0.2 -> (I0.3, I0.4, I0.5 parallel) -> I1.1 -> I1.2 -> I1.3 -> (I1.4, I1.5) -> I1.6 -> I1.7 -> I1.8

## 4. Exit criteria (CP0-CP1 done)
- FE login -> refresh -> logout runs against real BE in 2 tabs without forced logout
- Every error `code` used by auth slice maps to a user-facing message (Vietnamese)
- MAP §6 CP rows updated: "FE adopted"; roadmap gets integration phase entry
- Mismatch log (§5) empty or each entry resolved

## 5. Mismatch log
| # | Found in | Mismatch | Decision (BE/FE/MAP) | Status |
|---|---|---|---|---|

## 6. Risks
| Risk | Mitigation |
|---|---|
| HTTPS dev cert untrusted in browser | I0.1 recipe; document in this plan |
| Mock viewer ids differ from BE ids | viewer always from `GET me`; clear persisted mock session on switch to real API |
| Cross-tab race still logs out all tabs | I1.3 test + manual 2-tab check |
| BE restart wipes data mid-test | seed ids deterministic; I1.8 |

## 7. Next after CP1
- CP2: profile, post create/edit/detail/thread, saved, like/bookmark (remove toggle usage, BG §10 #17)
- CP3: private account, follow requests, block, close friends
- CP4: feed, notifications (extend `NotificationPayload` union), mute
