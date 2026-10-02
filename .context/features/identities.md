---
module: Identities & Authentication
description: Account registration, JWT auth, session limit & OTP password reset.
updated: 2026-10-02
---

# IDENTITIES SPECS

## 1. Auth & Session Management
- **Auth flow:** JWT Access Token + Refresh Token rotation
- **Session limits:** device session limits enforced via `DeviceSessionLimitRule`
- **Account lifecycle:** Sign up, Sign in, Change password (revokes active tokens), Deactivate/Activate account

## 2. Password Reset (OTP Flow)
- **Token generation:** generate OTP token & raise `PasswordResetTokenGeneratedEvent` to trigger email dispatch
- **Verification limits:** max 5 attempts per OTP token before invalidation (`IsMaxAttemptsReached`)
- **Reset action:** validate active OTP -> update password hash -> mark token used (`IsUsed = true`) -> revoke all active refresh tokens
