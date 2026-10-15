---
module: Backend Testing
description: Test layers (Domain/Application unit, API integration), harness rules & test matrix
stack: xUnit / NSubstitute / FluentAssertions / Mvc.Testing / .NET 8
updated: 2026-10-15
---

# 1. INFRASTRUCTURE & STANDARDS

## 1.1 Projects & Visibility

| Project | Layer | Tests (2026-10-15, all passing) |
|---|---|---|
| `tests/YSocial.Domain.UnitTests` (`net8.0`) | Domain: aggregates, rules, services (mock repos) | 60 |
| `tests/YSocial.Application.UnitTests` (`net8.0`) | Application & pipeline: access policy, projector, dispatcher/behaviors, session lock, log redaction, notification outbox | 41 |
| `tests/YSocial.Api.IntegrationTests` (`net8.0`) | real HTTP pipeline over `WebApplicationFactory<Program>` (see 1.3) | 413 |

- **Packages (all 3):** `xunit` 2.7.1, `xunit.runner.visualstudio`, `Microsoft.NET.Test.Sdk`, `NSubstitute`, `FluentAssertions` 8.3.0; integration adds `Microsoft.AspNetCore.Mvc.Testing` 8.0.26
- **Visibility:** MUST add `[assembly: InternalsVisibleTo("YSocial.<Layer>.UnitTests")]` / `("YSocial.Api.IntegrationTests")` to `YSocial.Domain.csproj`, `YSocial.Application.csproj` & `YSocial.Infrastructure.csproj` for direct testing of `internal sealed record` rules, handlers & mock repos
- **Matrix status:** tables in sections 2-3 mix EXISTING tests & TARGET backlog; the "Existing" lines list what is really in the project; most handler behavior is covered end-to-end by the integration layer instead of per-handler unit tests

## 1.2 Data & Execution Conventions
- **StronglyTypedIds:** instantiate source-generated structs via constructor: `new UserId(Guid.NewGuid())`, or fixed GUIDs `new UserId(Guid.Parse("..."))` for assertions. NEVER use `UserId.New()`
- **AAA:** Arrange - Act - Assert for all test methods
- **Method Naming:** `[MethodName]_[Scenario]_[ExpectedResult]`

## 1.3 API integration layer (`YSocial.Api.IntegrationTests`)

> Acceptance of every contract (status, `code`, DTO shape, access rules) = tests over the real HTTP pipeline; Swagger is NOT the source of truth

- **Host:** `ApiFactory : WebApplicationFactory<Program>` (`public partial class Program;`); removes the hosted `ProcessNotificationOutboxJob` (it mutates shared state; outbox tests call processing directly); adds test-only `TestProbeController` (generic error mapping, fail-after-event probe); client base `https://localhost`, no auto-redirect
- **Fixture & base:** one host per run (`ApiFixture` via `[CollectionDefinition("Api")]` `ICollectionFixture`); every test class derives `ApiTestBase` (`[Collection("Api")]`), whose ctor calls `MockDataStore.ResetForTests()` -> each test starts from the identical seed; `LoginAsync(loginId)` returns a bearer client (`AuthHelper`; `Seed.*` constants name the seed logins, credentials live in `SeedIds` and are NOT repeated in docs)
- **Serialized:** `[assembly: CollectionBehavior(DisableTestParallelization = true)]` (the static in-memory store is shared by the whole assembly)
- **Reset rule:** `MockDataStore.ResetForTests()` clears every static collection IN PLACE (`Clear()`, NEVER reassign: singleton repos & `MockNotificationOutboxStore` hold references), also clears the removed-events queue & outbox, then reseeds; any new static mutable state MUST be added to the reset
- **Deterministic seed:** `SeedIds` (fixed GUIDs, `BaseTime`) + `MockSeeder` (reflection on private setters allowed ONLY there; bcrypt work factor 4); tests may reference seed ids directly
- **Characterization & probe tests** (`Characterization/`): pinned behavior that must survive the recovery + the probes of BG §12; target-behavior tests started as `[Fact(Skip = "T1.x")]` and were un-skipped by their owner task (0 skipped now)
- **Layout (by area):** `Characterization`, `Config` (CORS), `Contract` (Swagger), `Errors` (pipeline, `RuleCodesTests`, framework 405/415), `Events` (dispatch), `Feed`, `Identities` (register, session, refresh, race tests), `Interactions` (like/bookmark, write enforcement, hidden-target ownership 404-before-403), `Notifications`, `Pagination`, `Posts` (incl. share link), `Relations` (follow lists, requests, privacy, mute), `Security` (log redaction, Production startup), `Smoke`, `Status` (status codes), `Threads`, `Users` (profile reads)
- **Helpers:** `StoreData.AddUser/AddAccepted` (direct store seeding: many users/edges, events cleared); `ApiFactory.Logs` = `CapturingLoggerProvider` (every host log line; cleared per test by `ApiTestBase`) for redaction tests
- **Static-store isolation:** unit tests that need the outbox use their OWN list (`new MockNotificationOutboxStore { Messages = [] }`): other classes call `MockDataStore.ResetForTests()` in parallel
- **Non-Development hosts:** `Factory.WithWebHostBuilder(b => b.UseEnvironment("Production"))` MUST also `UseSetting("Jwt:SecretKey", <value with >= 32 chars>)`, else startup fails by design
- **Race tests:** parallel requests released by a barrier, repeated (e.g. 50x); assert exactly 1 winner / no active token left / active <= 5
- **Naming:** `[Subject]_[Scenario]_[Expected]` (e.g. `Refresh_RotatedToken_Returns401`)
- **Contract guards elsewhere:** `RuleClassificationTests` (Domain: `AllRules_AreClassified`, `AllRuleCodes_ExistInCatalog`, `CodesSnapshot_MatchesApprovedList`), `SwaggerTests` (Api: `Swagger_Builds`, response schemas, `ProblemDetails` errors, DTO schemas)

---

# 2. DOMAIN TEST MATRIX (`YSocial.Domain.UnitTests`)

## 2.1 Identities

- **Existing (`Identities/AccountTests.cs`, 9):** `EnsureCanLogin_InactiveAccount_Throws`, `VerifyPassword_ReflectsHasher`, `AddRefreshToken_SixthActive_EvictsOldest`, `AddRefreshToken_ManyLogins_NeverMoreThanFiveActive`, `AddRefreshToken_KeepsRotatedAncestorsOfLiveFamily`, `RotateRefreshToken_KeepsProfile_RecordsSuccessor`, `RotateRefreshToken_WithNewProfile_SwitchesBinding`, `RotateRefreshToken_Rotated_Throws`, `RevokeRefreshToken_Rotated_RevokesWholeFamily`
- **Existing (`Common/RuleClassificationTests.cs`, 3):** rule classification & code snapshot (see 1.3)
- Table below = target backlog (corrected to current behavior)

### `Identities/AccountTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldCreateAccount_WhenValidEmailAndPassword` | Happy path; verify Id, Email, Role=Member, IsActive=true |
| 2 | `Create_ShouldRaiseAccountCreatedEvent_WhenCreated` | DomainEvents contains `AccountCreatedEvent` |
| 3 | `Create_ShouldThrowBusinessRuleException_WhenEmailInvalid` | Invalid email format |
| 4 | `Create_ShouldValidatePhoneNumber_WhenPhoneProvided` | Phone validation |
| 5 | `VerifyPassword_ShouldReturnTrue_WhenCredentialsValid` | Happy path |
| 6 | `EnsureCanLogin_ShouldThrowBusinessRuleException_WhenAccountInactive` | IsActive=false (`AccountMustBeActiveRule`, called AFTER password verify; 403 `AccountInactive`) |
| 7 | `VerifyPassword_ShouldReturnFalse_WhenPasswordWrong` | login failure is `Result.Unauthorized` in the handler (no exception) |
| 8 | `ChangePassword_ShouldUpdateHash_WhenCalled` | PasswordHash changed |
| 9 | `ChangePassword_ShouldRevokeAllRefreshTokens_WhenCalled` | All active tokens revoked |
| 10 | `GeneratePasswordResetToken_ShouldAddToken_WhenCalled` | PasswordResetTokens.Count increases |
| 11 | `GeneratePasswordResetToken_ShouldRaiseEvent_WhenCalled` | `PasswordResetTokenGeneratedEvent` |
| 12 | `ResetPassword_ShouldChangePassword_WhenOtpValid` | PasswordHash changed, token MarkAsUsed |
| 13 | `ResetPassword_ShouldThrowBusinessRuleException_WhenNoActiveToken` | No active token |
| 14 | `ResetPassword_ShouldThrowBusinessRuleException_WhenMaxAttemptsReached` | Max attempts exceeded |
| 15 | `ResetPassword_ShouldIncrementAttempt_WhenOtpWrong` | AttemptCount increases; `InvalidOtpRule` |
| 16 | `AddRefreshToken_ShouldReturnToken_WhenUnderSessionLimit` | Happy path, token bound to `UserId` |
| 17 | `AddRefreshToken_ShouldEvictOldest_WhenSessionLimitReached` | EXISTING as `AddRefreshToken_SixthActive_EvictsOldest` (`DeviceSessionLimitRule` removed) |
| 18 | `RotateRefreshToken_ShouldRevokeOldAndCreateNew_WhenTokenActive` | Old revoked, new created |
| 19 | `RotateRefreshToken_ShouldThrowBusinessRuleException_WhenTokenNotActive` | `RefreshTokenMustBeActiveRule` (401 `InvalidRefreshToken`) |
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

- Target backlog (no tests in the project yet; covered end-to-end by `Users/ProfileReadTests` & `Identities/*`)

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

- **Existing:** `UserRelations/UserRelationTests.cs` (16), `Services/UserRelationManagerTests.cs` (20), `Rules/*Tests.cs` (3 files x 2); rows below match them (names differ slightly: e.g. `...WhenTargetIsDeleted`, `...ThrowEntityNotFoundException...`)
- `UserBlocks/UserBlockTests.cs` = target backlog

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
| 11 | `SetMuted_*` (3 tests) | flag + `MutedAt`, `UpdatedAt` untouched, idempotent & unmute clears `MutedAt`, soft-deleted edge stays deleted |
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
| 6 | `FollowUserAsync_ShouldThrowBusinessRuleException_WhenObserverBlockedTarget` | `CannotFollowBlockedUserRule` (Kind NotFound -> 404) |
| 7 | `FollowUserAsync_ShouldThrowBusinessRuleException_WhenTargetBlockedObserver` | `TargetMustNotHaveBlockedObserverRule` (Kind NotFound -> 404) |
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
| 19 | `ToggleCloseFriendAsync_ShouldThrowBusinessRuleException_WhenNotFollowing` | `CloseFriendRequiresAcceptedFollowRule` (400 `CloseFriendRequiresAcceptedFollow`) |
| 20 | `ToggleCloseFriendAsync_ShouldThrowBusinessRuleException_WhenRelationNull` | `CloseFriendRequiresAcceptedFollowRule` |

### `UserBlocks/UserBlockTests.cs`
| # | Test Name | Note |
|---|-----------|------|
| 1 | `Create_ShouldCreateBlock_WhenValid` | Id, ObserverId, TargetId set |
| 2 | `Create_ShouldRaiseUserBlockedEvent_WhenCreated` | DomainEvent |
| 3 | `Create_ShouldThrowBusinessRuleException_WhenBlockingSelf` | `CannotBlockYourselfRule` |
| 4 | `Unblock_ShouldRaiseUserUnblockedEvent_WhenCalled` | DomainEvent |

### `Notifications/NotificationTests.cs` (4)
- `TargetId` kept, self notification throws, mark-read by non-recipient throws, mark-read idempotent

### Business Rules Direct Tests (~48 rule files)
- Only 3 rule test classes exist (UserRelations); all rules are covered by the classification reflection tests + API tests
- Each rule test class SHOULD implement 2 boundary tests:
  - `BrokenWhen_ShouldReturnTrue_When[ViolationCondition]`
  - `BrokenWhen_ShouldReturnFalse_When[ValidCondition]`

---

# 3. APPLICATION TEST MATRIX (`YSocial.Application.UnitTests`)

## 3.1 Existing (41)
- `Access/ViewerAccessPolicyTests` (16): owner/anonymous/pending/accepted vs private, block either direction, deleted author, FollowersOnly & Private posts, dormant close-friend flag, comment under inaccessible root, filter helpers, `GetContext_CallsEachRepoOnce_For50Candidates`
- `Posts/PostProjectorTests` (8): post/comment kind & parent, viewer flags per kind, anonymous = no viewer lookups, fixed repo calls per page, dropped inaccessible items, direct-children counting (`CommentCount_PostIdAndCommentIdQueriesNeverMix`)
- `Cqrs/EventDispatchUnitTests` (6): dispatcher max passes, drain-until-empty, failure discards remaining; `TransactionBehavior` success commits, failed `Result`/exception skips commit & discards
- `Identity/AccountSessionLockTests` (2): same account serialized & different accounts parallel, double dispose releases once
- `Notifications/NotificationOutboxProcessorTests` (4): delivered message removed & payload sent to the recipient, failed message retried then dropped after `MaxAttempts`, bounded batch, FE payload field set
- `Cqrs/LogRedactorTests` (5): password/OTP/token members masked by name, attribute marks other names, nested & collections, failed `Result`, null

## 3.2 Command handlers (CQRS) - target backlog
Mock deps (`IUserContext`, repos, Domain Services) via NSubstitute. Assert returned `Result` / `Result<T>`. Handler behavior is currently verified end-to-end by the integration layer (1.3)

- **Identities:** `RegisterAccountCommandHandler`, `LoginCommandHandler`, `ForgotPasswordCommandHandler`, `ResetPasswordCommandHandler`, `DeleteAccountCommandHandler`, `LogoutUserCommandHandler`, `RefreshTokenCommandHandler`
- **Users:** `DeleteProfileCommandHandler`, `SetDefaultProfileCommandHandler`, `SwitchProfileCommandHandler`, `UpdateProfileCommandHandler`, `UpdatePrivacyCommandHandler`
- **User Relations:** `FollowUserCommandHandler`, `UnfollowUserCommandHandler`, `ToggleCloseFriendCommandHandler`, `RespondFollowRequestCommandHandler`
- **User Blocks:** `BlockUserCommandHandler`, `UnblockUserCommandHandler`

## 3.3 Event handlers - target backlog
- `InitializeUserProfileHandler`: generates default profile on `AccountCreatedEvent`
- `RemoveUserWhenAccountDeletedEventHandler`: clears profiles on account deletion
- `UpdateFollowCountsHandler`: mutates follower/following count on relation update (API: `FollowPublicUser_IncrementsCounts`, `Unfollow_DecrementsCounts`)
- `RemoveFollowsWhenUserBlockedEventHandler`: purges active follow relations on `UserBlockedEvent` (API: `Block_RemovesFollowsBothDirections_CountsInSameRequest`)

---

# 4. VERIFICATION PLAN

- [x] **Build:** `dotnet build YSocial.sln` (0 errors, 0 warnings)
- [x] **Domain:** `dotnet test tests/YSocial.Domain.UnitTests` (60 pass)
- [x] **Application:** `dotnet test tests/YSocial.Application.UnitTests` (41 pass)
- [x] **API integration:** `dotnet test tests/YSocial.Api.IntegrationTests` (413 pass, serialized, identical seed per test)
- [x] **All:** `dotnet test YSocial.sln`
