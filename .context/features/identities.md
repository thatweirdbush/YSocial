---
module: Identities & Authentication
description: Account registration, JWT authentication, session limit & OTP password reset.
---

# IDENTITIES SPECS

## 1. Authentication & Session Management
- **Auth Flow:** JWT Access Token + Refresh Token rotation.
- **Session Limits:** Device session limits enforced via `DeviceSessionLimitRule`.
- **Account Lifecycle:** Sign up, Sign in, Change password (revokes active tokens), Deactivate/Activate account.

## 2. Password Reset (OTP Flow)
- **Token Generation:** Generates OTP token & raises `PasswordResetTokenGeneratedEvent` to trigger Email dispatch.
- **Verification Limits:** Max 5 attempts per OTP token before invalidation (`IsMaxAttemptsReached`).
- **Reset Action:** Validates active OTP, updates password hash, marks token as used (`IsUsed = true`) & revokes all active refresh tokens.