---
module: Identities & Authentication
description: Design decisions of account registration, JWT auth, session limit & OTP password reset (endpoints & errors live in MAP)
updated: 2026-10-19
---

# IDENTITIES SPECS

> Single owner per fact: endpoints, statuses, error codes & DTOs = `.context/backend/integration/frontend-backend-mapping.md` (MAP §1, §2.1); auth lifecycle, session lock & concurrency = `.context/backend/architecture/backend-guide.md` (BG §6); rules & state = `domain-model.md` (DM §4, §5.6); decisions D3-D6, D11 = recovery plan §4

## 1. Auth & Session Management
- **Auth flow:** JWT access token (15 min) + opaque refresh token (7 days) with rotation; refresh tokens are profile-bound & single-use (token family)
- **Session limit:** max 5 active refresh tokens per account; 6th login evicts oldest (no error); `DeviceSessionLimitRule` no longer exists
- **Login failure:** uniform `401 InvalidCredentials` for unknown, deleted & wrong password; account state (`403 AccountInactive`) revealed only after valid password (anti-enumeration)
- **Concurrency:** every refresh-token mutation (login, refresh, logout, switch profile, reset password, delete account) runs under per-account `IAccountSessionLock`
- **Account lifecycle (exposed):** register (with chosen username), login, refresh, logout, reset password, delete account, switch profile
- **Not exposed (domain only):** change password (only via reset), deactivate/activate account, role assignment, session list

## 2. Password Reset (OTP Flow)
- **Token generation:** generate OTP token & raise `PasswordResetTokenGeneratedEvent` to trigger email dispatch (mock senders never log OTP: no body outside Development, digit runs masked in Development unless `Messaging:LogOtpInDevelopment=true` in local `appsettings.Development.json`; pipeline logs are redacted)
- **Verification limits:** max 5 attempts per OTP token before invalidation (`IsMaxAttemptsReached`); wrong OTP -> `InvalidOtp`, exhausted -> `OtpAttemptsExceeded`
- **Reset action:** validate active OTP -> update password hash -> mark token used (`IsUsed = true`) -> revoke all active refresh tokens
- **Privacy:** `forgot-password` always answers 204 (no account enumeration)

## 3. Registration
- **Username:** chosen at register, format `^[a-z0-9._]{3,30}$` (validator, 400), unique case-insensitive incl. soft-deleted profiles (409 `UsernameTaken`); emails unique incl. deleted accounts (409 `EmailTaken`); uniqueness checked BEFORE account creation (no orphan account); username flows to default profile via `AccountCreatedEvent`


## 4. FE adoption (as-built: `features/fe-be-integration.md`)
- **Slice:** `NEXT_PUBLIC_REAL_API_SLICES=auth`; register -> `POST register` then `POST login` (no tokens on register), viewer from `GET users/me`
- **Refresh:** FE coordinates single-use rotation across tabs (`navigator.locks` + adoption of token rotated by another tab); session ends only on 401 `InvalidRefreshToken` with unchanged stored token
- **Smoke:** with `Messaging:LogOtpInDevelopment=true` the OTP is readable in the BE Development log (reset flow verified on real BE 2026-10-19, plan M17)
