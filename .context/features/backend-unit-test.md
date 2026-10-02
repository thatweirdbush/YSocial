---
module: Backend Testing
description: Unit Test Spec & Test Matrix for project
stack: xUnit / NSubstitute / FluentAssertions / .NET 8
updated: 2026-10-02
---

# 1. INFRASTRUCTURE & STANDARDS

## 1.1 Projects & Visibility
- **Domain tests:** `tests/YSocial.Domain.UnitTests/YSocial.Domain.UnitTests.csproj` (`net8.0`)
  - Packages: `xunit`, `xunit.runner.visualstudio`, `Microsoft.NET.Test.Sdk`, `NSubstitute`, `FluentAssertions`
- **Application tests:** `tests/YSocial.Application.UnitTests/YSocial.Application.UnitTests.csproj`
- **Visibility:** MUST add `[assembly: InternalsVisibleTo("YSocial.Domain.UnitTests")]` to `YSocial.Domain.csproj` & `YSocial.Application.csproj` to direct testing of `internal sealed record` BusinessRules

## 1.2 Data & Execution Conventions
- **StronglyTypedIds:** instantiate source-generated structs via constructor: `new UserId(Guid.NewGuid())`, or fixed GUIDs `new UserId(Guid.Parse("..."))` for assertions. NEVER use `UserId.New()`
- **AAA:** Arrange - Act - Assert for all test methods
- **Method Naming:** `[MethodName]_[Scenario]_[ExpectedResult]`

---

# 2. DOMAIN TEST MATRIX (`YSocial.Domain.UnitTests`)

## 2.1 Identities

### `Identities/AccountTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldCreateAccount_WhenValidEmailAndPassword` | Happy path; verify Id, Email, Role=Member, IsActive=true |
| 2 | `Create_ShouldRaiseAccountCreatedEvent_WhenCreated` | DomainEvents contains `AccountCreatedEvent` |
| 3 | `Create_ShouldThrowBusinessRuleException_WhenEmailInvalid` | Invalid email format |
| 4 | `Create_ShouldValidatePhoneNumber_WhenPhoneProvided` | Phone validation |
| 5 | `Login_ShouldSucceed_WhenCredentialsValid` | Happy path, no throw |
| 6 | `Login_ShouldThrowBusinessRuleException_WhenAccountInactive` | IsActive=false |
| 7 | `Login_ShouldThrowBusinessRuleException_WhenPasswordWrong` | Verify returns false |
| 8 | `ChangePassword_ShouldUpdateHash_WhenCalled` | PasswordHash changed |
| 9 | `ChangePassword_ShouldRevokeAllRefreshTokens_WhenCalled` | All active tokens revoked |
| 10 | `GeneratePasswordResetToken_ShouldAddToken_WhenCalled` | PasswordResetTokens.Count increases |
| 11 | `GeneratePasswordResetToken_ShouldRaiseEvent_WhenCalled` | `PasswordResetTokenGeneratedEvent` |
| 12 | `ResetPassword_ShouldChangePassword_WhenOtpValid` | PasswordHash changed, token MarkAsUsed |
| 13 | `ResetPassword_ShouldThrowBusinessRuleException_WhenNoActiveToken` | No active token |
| 14 | `ResetPassword_ShouldThrowBusinessRuleException_WhenMaxAttemptsReached` | Max attempts exceeded |
| 15 | `ResetPassword_ShouldIncrementAttempt_WhenOtpWrong` | AttemptCount increases |
| 16 | `AddRefreshToken_ShouldReturnToken_WhenUnderSessionLimit` | Happy path |
| 17 | `AddRefreshToken_ShouldThrowBusinessRuleException_WhenSessionLimitReached` | `DeviceSessionLimitRule` |
| 18 | `RotateRefreshToken_ShouldRevokeOldAndCreateNew_WhenTokenActive` | Old revoked, new created |
| 19 | `RotateRefreshToken_ShouldThrowBusinessRuleException_WhenTokenNotActive` | `RefreshTokenMustBeActiveRule` |
| 20 | `RevokeRefreshToken_ShouldRevoke_WhenTokenExists` | Token.RevokedAt set |
| 21 | `RevokeRefreshToken_ShouldDoNothing_WhenTokenNotFound` | Idempotent |
| 22 | `RevokeAllRefreshTokens_ShouldRevokeAll_WhenMultipleActive` | All tokens revoked |
| 23 | `Deactivate_ShouldSetInactive_WhenCalled` | IsActive=false, raises event |
| 24 | `Activate_ShouldSetActive_WhenCalled` | IsActive=true |
| 25 | `Delete_ShouldMarkDeleted_WhenCalled` | IsDeleted=true, revoke tokens, raises event |

### `Identities/PasswordHashTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldCreateHash_WhenValueNotEmpty` | Happy path |
| 2 | `Create_ShouldThrowBusinessRuleException_WhenValueEmpty` | `PasswordHashMustNotBeEmptyRule` |

### `Identities/PasswordResetTokenTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldInitialize_WhenValid` | IsUsed=false, AttemptCount=0 |
| 2 | `MarkAsUsed_ShouldSetIsUsed_WhenCalled` | IsUsed=true |
| 3 | `IncrementAttempt_ShouldIncreaseCount_WhenCalled` | AttemptCount++ |
| 4 | `IsExpired_ShouldReturnTrue_WhenPastExpiry` | ExpiryTime in past |
| 5 | `IsMaxAttemptsReached_ShouldReturnTrue_WhenAtMax` | AttemptCount >= 5 |

### `Identities/RefreshTokenTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldCreateToken_WhenValid` | Happy path |
| 2 | `Create_ShouldThrowBusinessRuleException_WhenTokenEmpty` | `RefreshTokenValueNotEmptyRule` |
| 3 | `Create_ShouldThrowBusinessRuleException_WhenAlreadyExpired` | `RefreshTokenMustNotBeExpiredRule` |
| 4 | `Revoke_ShouldSetRevokedAt_WhenCalled` | RevokedAt != null |
| 5 | `Revoke_ShouldNotChangeRevokedAt_WhenAlreadyRevoked` | Idempotent (`??=`) |
| 6 | `IsActive_ShouldReturnFalse_WhenRevoked` | RevokedAt has value |
| 7 | `IsActive_ShouldReturnFalse_WhenExpired` | ExpiryTime in past |

---

## 2.2 Users

### `Users/UserTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldCreateUser_WhenValid` | Id, Username, default ProfileInfo, default PrivacySettings |
| 2 | `Create_ShouldRaiseUserProfileCreatedEvent_WhenCreated` | DomainEvent |
| 3 | `Create_ShouldThrowBusinessRuleException_WhenUsernameTooShort` | `UsernameMustBeMinimumLengthRule` |
| 4 | `IncrementFollowers_ShouldIncrease_WhenCalled` | FollowersCount++ |
| 5 | `DecrementFollowers_ShouldDecrease_WhenPositive` | FollowersCount-- |
| 6 | `DecrementFollowers_ShouldNotGoBelowZero_WhenAlreadyZero` | Guard FollowersCount >= 0 |
| 7 | `IncrementFollowing_ShouldIncrease_WhenCalled` | FollowingCount++ |
| 8 | `DecrementFollowing_ShouldNotGoBelowZero_WhenAlreadyZero` | Guard |
| 9 | `Delete_ShouldMarkDeleted_WhenNotDefault` | IsDeleted=true |
| 10 | `Delete_ShouldThrowBusinessRuleException_WhenIsDefault` | `CannotDeleteDefaultUserRule` |
| 11 | `Delete_ShouldBypassDefaultCheck_WhenAccountDeletion` | `isAccountDeletion: true` |
| 12 | `SetAsDefault_ShouldSetTrue_WhenCalled` | IsDefault=true |
| 13 | `UpdateProfile_ShouldUpdateProfileInfo_WhenCalled` | ProfileInfo changed |
| 14 | `UpdatePrivacySettings_ShouldUpdate_WhenCalled` | PrivacySettings changed |

### `Users/UserProfileInfoTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Constructor_ShouldCreate_WhenValid` | Happy path |
| 2 | `Constructor_ShouldThrowBusinessRuleException_WhenDisplayNameEmpty` | `DisplayNameMustNotBeEmptyRule` |
| 3 | `Constructor_ShouldThrowBusinessRuleException_WhenDisplayNameTooLong` | `DisplayNameLengthRule` |
| 4 | `Constructor_ShouldThrowBusinessRuleException_WhenBioTooLong` | `BioLengthRule` |
| 5 | `Constructor_ShouldThrowBusinessRuleException_WhenDateOfBirthInFuture` | `DateOfBirthMustBeInPastRule` |
| 6 | `Constructor_ShouldThrowBusinessRuleException_WhenDisplayNameContainsSensitiveWords` | `NoSensitiveWordsRule` |
| 7 | `CreateDefault_ShouldUseDefaults_WhenCalled` | Gender=Unspecified, ProfileType=Personal |

### `Users/UserProfileServiceTests.cs` (Mock `IUserRepository`)
| # | Test Name | Note |
|---|-----------|------|
| 1 | `SetDefaultProfileAsync_ShouldSetNewDefault_WhenValid` | New user -> IsDefault=true, old -> false |
| 2 | `SetDefaultProfileAsync_ShouldThrowBusinessRuleException_WhenNoProfiles` | `AccountMustHaveAtLeastOneProfileRule` |
| 3 | `SetDefaultProfileAsync_ShouldThrowBusinessRuleException_WhenUserNotBelongToAccount` | `UserMustBelongToAccountRule` |
| 4 | `ResolveProfile_ShouldReturnMatchByUsername_WhenUsernameMatches` | loginId = username |
| 5 | `ResolveProfile_ShouldReturnDefault_WhenNoUsernameMatch` | Fallback IsDefault=true |
| 6 | `ResolveProfile_ShouldReturnFirst_WhenNoDefaultAndNoMatch` | Fallback FirstOrDefault |
| 7 | `ResolveProfile_ShouldReturnNull_WhenNoProfiles` | Empty list / null |
| 8 | `VerifyDeletionRules_ShouldThrowBusinessRuleException_WhenOnlyOneProfile` | `AccountMustHaveAtLeastOneProfileRule` |

---

## 2.3 User Relations & User Blocks

### `UserRelations/UserRelationTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldInitialize_WhenValid` | FollowStatus=None, IsDeleted=false |
| 2 | `RequestFollow_ShouldSetAccepted_WhenTargetIsPublic` | FollowStatus=Accepted, raises `UserFollowAcceptedEvent` |
| 3 | `RequestFollow_ShouldSetPending_WhenTargetIsPrivate` | FollowStatus=Pending, raises `UserFollowRequestedEvent` |
| 4 | `RequestFollow_ShouldBeIdempotent_WhenAlreadyAccepted` | No extra events, no state change |
| 5 | `RequestFollow_ShouldBeIdempotent_WhenAlreadyPending` | No extra events |
| 6 | `RequestFollow_ShouldRestore_WhenPreviouslyDeleted` | IsDeleted->false, DeletedAt->null |
| 7 | `AcceptFollow_ShouldSetAccepted_WhenPending` | FollowStatus=Accepted, raises event |
| 8 | `AcceptFollow_ShouldBeIdempotent_WhenAlreadyAccepted` | No event |
| 9 | `ToggleCloseFriend_ShouldSetTrue_WhenFollowingAccepted` | IsCloseFriend=true |
| 10 | `ToggleCloseFriend_ShouldNotChange_WhenNotAccepted` | Guard: FollowStatus != Accepted |
| 11 | `ToggleMute_ShouldSetTrue_WhenCalled` | IsMuted=true |
| 12 | `Delete_ShouldSoftDelete_WhenActive` | IsDeleted=true, DeletedAt set |
| 13 | `Delete_ShouldRaiseUnfollowedEvent_WhenWasAccepted` | `UserUnfollowedEvent` |
| 14 | `Delete_ShouldNotRaiseEvent_WhenWasPending` | No `UserUnfollowedEvent` (was not Accepted) |
| 15 | `Delete_ShouldBeIdempotent_WhenAlreadyDeleted` | No duplicate events |

### `UserRelations/Services/UserRelationManagerTests.cs` (Mock Repositories)
| # | Test Name | Note |
|---|-----------|------|
| 1 | `FollowUserAsync_ShouldCreateAndFollow_WhenNoExistingRelation` | New relation created, RequestFollow called |
| 2 | `FollowUserAsync_ShouldReuseRelation_WhenDeletedRelationExists` | Restore soft-deleted relation |
| 3 | `FollowUserAsync_ShouldThrowBusinessRuleException_WhenFollowingSelf` | `CannotFollowYourselfRule` |
| 4 | `FollowUserAsync_ShouldThrowEntityNotFound_WhenTargetNotFound` | `EntityNotFoundException` |
| 5 | `FollowUserAsync_ShouldThrowBusinessRuleException_WhenTargetDeleted` | `CannotInteractWithDeletedUserRule` |
| 6 | `FollowUserAsync_ShouldThrowBusinessRuleException_WhenObserverBlockedTarget` | `CannotFollowBlockedUserRule` |
| 7 | `FollowUserAsync_ShouldThrowBusinessRuleException_WhenTargetBlockedObserver` | `TargetMustNotHaveBlockedObserverRule` |
| 8 | `FollowUserAsync_ShouldSetPending_WhenTargetIsPrivate` | Private profile -> FollowStatus.Pending |
| 9 | `FollowUserAsync_ShouldSetAccepted_WhenTargetIsPublic` | Public profile -> FollowStatus.Accepted |
| 10 | `UnfollowUserAsync_ShouldSoftDelete_WhenRelationExists` | `relation.Delete()` called |
| 11 | `UnfollowUserAsync_ShouldReturnNull_WhenNoRelation` | Return null, no exception |
| 12 | `BlockUserAsync_ShouldCreateBlock_WhenNotBlocked` | New UserBlock created |
| 13 | `BlockUserAsync_ShouldBeIdempotent_WhenAlreadyBlocked` | Return existing block |
| 14 | `BlockUserAsync_ShouldThrowBusinessRuleException_WhenBlockingSelf` | `CannotBlockYourselfRule` |
| 15 | `UnblockUserAsync_ShouldRemoveBlock_WhenBlockExists` | Unblock + Remove called |
| 16 | `UnblockUserAsync_ShouldDoNothing_WhenNotBlocked` | No exception |
| 17 | `UnblockUserAsync_ShouldThrowBusinessRuleException_WhenUnblockingSelf` | `CannotBlockYourselfRule` |
| 18 | `ToggleCloseFriendAsync_ShouldToggle_WhenFollowingAccepted` | ToggleCloseFriend called |
| 19 | `ToggleCloseFriendAsync_ShouldThrowBusinessRuleException_WhenNotFollowing` | `BusinessRuleValidationException` |
| 20 | `ToggleCloseFriendAsync_ShouldThrowBusinessRuleException_WhenRelationNull` | `BusinessRuleValidationException` |

### `UserBlocks/UserBlockTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldCreateBlock_WhenValid` | Id, ObserverId, TargetId set |
| 2 | `Create_ShouldRaiseUserBlockedEvent_WhenCreated` | DomainEvent |
| 3 | `Create_ShouldThrowBusinessRuleException_WhenBlockingSelf` | `CannotBlockYourselfRule` |
| 4 | `Unblock_ShouldRaiseUserUnblockedEvent_WhenCalled` | DomainEvent |

### Business Rules Direct Tests (~25 rule files)
- Each rule test class MUST implement 2 boundary tests:
  - `BrokenWhen_ShouldReturnTrue_When[ViolationCondition]`
  - `BrokenWhen_ShouldReturnFalse_When[ValidCondition]`

---

# 3. APPLICATION TEST MATRIX (`YSocial.Application.UnitTests`)

## 3.1 Command Handlers (CQRS)
Mock deps (`IUserContext`, repos, Domain Services) via NSubstitute. Assert returned `Result` / `Result<T>`.

- **Identities:** `RegisterAccountCommandHandler`, `LoginCommandHandler`, `ForgotPasswordCommandHandler`, `ResetPasswordCommandHandler`, `DeleteAccountCommandHandler`, `LogoutUserCommandHandler`
- **Users:** `DeleteProfileCommandHandler`, `SetDefaultProfileCommandHandler`, `SwitchProfileCommandHandler`, `UpdateProfileCommandHandler`
- **User Relations:** `FollowUserCommandHandler`, `UnfollowUserCommandHandler`, `ToggleCloseFriendCommandHandler`
- **User Blocks:** `BlockUserCommandHandler`, `UnblockUserCommandHandler`

## 3.2 Event Handlers
- `InitializeUserProfileHandler`: generates default profile on `AccountCreatedEvent`
- `RemoveUserWhenAccountDeletedEventHandler`: clears profiles on account deletion
- `UpdateFollowCountsHandler`: mutates follower/following count on relation update
- `RemoveFollowsWhenUserBlockedEventHandler`: purges active follow relations on `UserBlockedEvent`

---

# 4. VERIFICATION PLAN

- [ ] **Build:** `dotnet build YSocial.sln --configuration Release`
- [ ] **Domain:** `dotnet test tests/YSocial.Domain.UnitTests --verbosity normal`
- [ ] **Application:** `dotnet test tests/YSocial.Application.UnitTests --verbosity normal`
