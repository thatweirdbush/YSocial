---
module: Backend Testing
description: Test layers (Domain/Application unit, API integration), harness rules & test matrix
stack: xUnit / NSubstitute / FluentAssertions / Mvc.Testing / .NET 8
updated: 2026-10-20
---

# 1. INFRASTRUCTURE & STANDARDS

## 1.1 Projects & Visibility

| Project | Layer | Tests (all passing) |
|---|---|---|
| `tests/YSocial.Domain.UnitTests` | Domain: aggregates, rules, services (substituted repos), hashtag parser parity | 130 |
| `tests/YSocial.Application.UnitTests` | Application & pipeline: access policy, projector, dispatcher/behaviors, session lock, log redaction; persistence over SQLite: repos, model snapshot guard, seeders, connection strings, notification outbox; session conflict outcomes | 81 (+3 PostgreSQL opt-in, skipped without `YSOCIAL_TEST_POSTGRES`) |
| `tests/YSocial.Api.IntegrationTests` | real HTTP pipeline over `WebApplicationFactory<Program>` & SQLite (see 1.3) | 523 |
| `tests/YSocial.TestSupport` (no tests) | shared harness: `SqliteTestDatabase`, `Store` facade | - |

- **All:** net8.0
- **Packages (all 3):** `xunit` 2.7.1, `xunit.runner.visualstudio`, `Microsoft.NET.Test.Sdk`, `NSubstitute`, `FluentAssertions` 8.3.0; integration adds `Microsoft.AspNetCore.Mvc.Testing` 8.0.26; TestSupport adds `Microsoft.EntityFrameworkCore.Sqlite` 9.0.4
- **Visibility:** MUST add `[assembly: InternalsVisibleTo("YSocial.<Layer>.UnitTests")]` / `("YSocial.Api.IntegrationTests")` to `YSocial.Domain.csproj`, `YSocial.Application.csproj` & `YSocial.Infrastructure.csproj` for direct testing of `internal sealed record` rules, handlers & repos
- **Matrix status:** tables in sections 2-3 mix EXISTING tests & TARGET backlog; "Existing" lines list what is really in project; most handler behavior is covered end-to-end by integration layer instead of per-handler unit tests

## 1.2 Data & Execution Conventions
- **StronglyTypedIds:** instantiate source-generated structs via constructor: `new UserId(Guid.NewGuid())`, or fixed GUIDs `new UserId(Guid.Parse("..."))` for assertions. NEVER use `UserId.New()`
- **AAA:** Arrange - Act - Assert for all test methods
- **Method Naming:** `[MethodName]_[Scenario]_[ExpectedResult]`

## 1.3 API integration layer (`YSocial.Api.IntegrationTests`)

> Acceptance of every contract (status, `code`, DTO shape, access rules) = tests over real HTTP pipeline; Swagger != source of truth

- **Host:** `ApiFactory(SqliteTestDatabase) : WebApplicationFactory<Program>` (`public partial class Program;`); replaces database registration by SQLite (never PostgreSQL, guard `Host_UsesTheSqliteTestDatabase_NeverPostgres`), turns `Database:AutoMigrate`/`SeedData` off; removes hosted `ProcessNotificationOutboxJob` (outbox tests call processing directly); adds test-only `TestProbeController` (generic error mapping, fail-after-event probe); client base `https://localhost`, no auto-redirect
- **Fixture & base:** 1 host per run (`ApiFixture` via `[CollectionDefinition("Api")]` `ICollectionFixture`); every test class derives `ApiTestBase` (`[Collection("Api")]`), whose ctor calls `Store.Reset()` (delete every row, re-seed core baseline) -> each test starts from identical seed; `LoginAsync(loginId)` returns bearer client (`AuthHelper`; `Seed.*` constants name seed logins, credentials live in `SeedIds` & are NOT repeated in docs)
- **Serialized:** `[assembly: CollectionBehavior(DisableTestParallelization = true)]` (1 shared SQLite database & static `Store` pointer for whole assembly)
- **Database:** `SqliteTestDatabase` = temp file (WAL, busy timeout: concurrent requests get own connections like PostgreSQL), schema by `EnsureCreated` (production model, no migrations), `Reset()` = `DELETE` of every table in model (new tables are covered automatically) + `CoreSeeder`
- **Deterministic seed:** `SeedIds` (fixed GUIDs, `BaseTime`) + `CoreSeeder` (3 accounts, 4 profiles, 2 posts; reflection on private setters allowed ONLY in `SeedFactory`; bcrypt work factor 4); tests may reference seed ids directly; `DevelopmentSeeder` data is NOT part of baseline
- **Characterization & probe tests** (`Characterization/`): pinned behavior that must survive recovery + probes of BG §12; target-behavior tests started as `[Fact(Skip = "T1.x")]` & were un-skipped by their owner task (0 skipped now)
- **Layout (by area):** `Characterization`, `Config` (CORS), `Contract` (Swagger), `Errors` (pipeline, `RuleCodesTests`, framework 405/415), `Events` (dispatch), `Feed`, `Identities` (register, session, refresh, race tests), `Interactions` (like/bookmark, write enforcement, hidden-target ownership 404-before-403), `Notifications`, `Pagination`, `Persistence` (atomic save, rollback, restart durability, 409, OTP attempts, forgot-password vs refresh race), `Posts` (incl. share link), `Relations` (follow lists, requests, privacy, mute), `Security` (log redaction, Production startup), `Smoke`, `Status` (status codes), `Threads`, `Users` (profile reads)
- **`Store` facade (`TestSupport`):** dictionary-like view of each aggregate table: reads = fresh snapshots (own context per call), writes (`Add`, `TryAdd`, `Update(id, change)`, `UpdateSingle`) save immediately WITHOUT dispatching events; arrange state through it, NEVER by mutating returned snapshot (changes are lost)
- **Helpers:** `StoreData.AddUser/AddAccepted` (direct seeding: many users/edges, no events), `AccountArrange.IssueOtp/ExpireToken`; `ApiFactory.Logs` = `CapturingLoggerProvider` (every host log line; cleared per test by `ApiTestBase`) for redaction tests
- **Isolation in unit tests:** every class that needs data creates its OWN `SqliteTestDatabase` (unique temp file, disposed with class), safe under xUnit parallelism
- **Non-Development hosts:** `Factory.WithWebHostBuilder(b => b.UseEnvironment("Production"))` MUST also `UseSetting("Jwt:SecretKey", <value with >= 32 chars>)`, else startup fails by design
- **Race tests:** parallel requests released by barrier, repeated (e.g. 50x); assert exactly 1 winner / no active token left / active <= 5; they rely on session lock + commit inside lock (BG §6.4)
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
| 7 | `VerifyPassword_ShouldReturnFalse_WhenPasswordWrong` | login failure is `Result.Unauthorized` in handler (no exception) |
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

- Target backlog (no tests in project yet; covered end-to-end by `Users/ProfileReadTests` & `Identities/*`)

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

### `Notifications/NotificationKindTests.cs` (10), `NotificationPreferencesTests.cs` (7)
- `NotificationKind.Of` maps all 5 types & covers every declared type, `TryParse` case-insensitive (blank/unknown/null rejected)
- `NotificationPreferences`: default all on, `Allows` false only for disabled kind (3 kinds x types), `User.UpdateNotificationPreferences` replaces

### API `Notifications/` (D26-D28)
- `NotificationKindFilterTests` (14): each kind, absent/empty/blank = all, case-insensitive, unknown/malformed 400 + `errors.kind`, repeated param observed (1 value), paging counts follow filtered list, blocked senders still excluded, `unreadCount` overall
- `NotificationReadAllUpToTests` (8): bound marks that & older only, newest = all, absent = all, idempotent, unknown 404, foreign 403 `NotNotificationRecipient`, blocked sender id accepted & hidden rows untouched, 401
- `NotificationPreferencesTests` (14): GET defaults, PUT full replace, missing/null field 400 & unchanged, 401; publisher skips per kind (post like, comment like, reply, new follow, follow requested, follow accepted for requester), no backfill when re-enabled, other recipients unaffected
- `Contract/SwaggerTests`: `preferences` GET/PUT response schema rows

### Business Rules Direct Tests (~48 rule files)
- Only 3 rule test classes exist (UserRelations); all rules are covered by classification reflection tests + API tests
- Each rule test class SHOULD implement 2 boundary tests:
  - `BrokenWhen_ShouldReturnTrue_When[ViolationCondition]`
  - `BrokenWhen_ShouldReturnFalse_When[ValidCondition]`

---

# 3. APPLICATION TEST MATRIX (`YSocial.Application.UnitTests`)

## 3.1 Existing (74)
- `Access/ViewerAccessPolicyTests` (16): owner/anonymous/pending/accepted vs private, block either direction, deleted author, FollowersOnly & Private posts, dormant close-friend flag, comment under inaccessible root, filter helpers, `GetContext_CallsEachRepoOnce_For50Candidates`
- `Posts/PostProjectorTests` (7): post/comment kind & parent, viewer flags per kind, anonymous = no viewer lookups, fixed repo calls per page, dropped inaccessible items, direct-children counting
- `Cqrs/EventDispatchUnitTests` (6): dispatcher max passes, drain-until-empty, failure discards remaining; `TransactionBehavior` success commits, failed `Result`/exception skips commit & discards
- `Identity/AccountSessionLockTests` (2): same account serialized & different accounts parallel, double dispose releases once
- `Identity/SessionConflictTests` (5): optimistic-concurrency conflict on in-lock commit ends in documented status (refresh & switch 401 `InvalidRefreshToken`, logout & forgot-password success), lock released
- `Notifications/NotificationOutboxProcessorTests` (5, SQLite): delivered row deleted & payload sent to recipient, failed row retried then dropped after `MaxAttempts`, bounded batch, oldest first, FE payload field set
- `Persistence/RepositoryTests` (15, SQLite, every reload = new context): account round trip with tokens, child insert (no update of new rows), dropped tokens deleted, concurrent writers -> `ConcurrencyConflictException`, untracked advisory lookup, login id (email/phone/username, case-insensitive, deleted hidden), username/email reservation incl. soft-deleted, enumeration/country/date round trip, comment post-id vs comment-id queries never mix, soft-deleted posts hidden, unique like index, event drain incl. hard-removed aggregates, discard, `Update` semantics, failed request saves nothing
- `Persistence/ModelTests` (3, Npgsql options, no connection): no pending model changes vs migration snapshot, no cross-aggregate foreign keys, all `DateTime` = timestamptz
- `Persistence/SeederTests` (3): core idempotent & = baseline, development dataset rich + idempotent + every counter matches rows + blocked pairs unrelated, all demo accounts accept known password
- `Persistence/ConnectionStringsTests` (6): `postgres://` URI -> Npgsql string (escapes, default port, ssl mode), key=value passthrough, missing -> error
- `Cqrs/LogRedactorTests` (5): password/OTP/token members masked by name, attribute marks other names, nested & collections, failed `Result`, null

## 3.2 Command handlers (CQRS) - target backlog
Mock deps (`IUserContext`, repos, Domain Services) via NSubstitute. Assert returned `Result` / `Result<T>`. Handler behavior is currently verified end-to-end by integration layer (1.3)

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
- [x] **Domain:** `dotnet test tests/YSocial.Domain.UnitTests` (130 pass)
- [x] **Application:** `dotnet test tests/YSocial.Application.UnitTests` (81 pass, 3 PostgreSQL opt-in skipped)
- [x] **API integration:** `dotnet test tests/YSocial.Api.IntegrationTests` (523 pass, serialized, identical seed per test)
- [x] **All:** `dotnet test YSocial.sln`
