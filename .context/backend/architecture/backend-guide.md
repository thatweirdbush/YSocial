---
module: Backend Implementation
stack: ASP.NET Core 8 / MediatR 14 / FluentValidation 12 / in-memory store
updated: 2026-10-14
---

# BACKEND GUIDE

## 0. Scope
- **Paths:** BE-solution-relative (`src/...`); BE root = folder holding `YSocial.sln` (located by filename lookup at `D:\Bush\`, 1 level above `YSocial/` FE monorepo folder; sibling `Microservice.BuildingBlocks` resolves 1 level higher)
- **Companions:** domain detail in `domain-model.md` | FE contract in `../integration/frontend-backend-mapping.md`
- **Generic conventions** (strongly-typed IDs, `IBusinessRule`, `Result`) in `.context/conventions/backend.md`

## 1. Solution & project map

| Project | Refs | Role | Key packages |
|---|---|---|---|
| `src/YSocial.Api` | Application, Infrastructure | controllers, `Program.cs`, JSON/Swagger plumbing | JwtBearer 8.0.26, Swashbuckle 6.6.2 |
| `src/YSocial.Application` | BuildingBlocks.CQRS, Domain | commands, queries, behaviors, event handlers | MediatR 14.1.0, FluentValidation 12.1.1, Scrutor 7.0.0 (unused) |
| `src/YSocial.Domain` | BuildingBlocks.Domain | aggregates, rules, events, repo contracts | StronglyTypedId 0.2.1, CommunityToolkit.Common 8.4.0 |
| `src/YSocial.Infrastructure` | Application | mock repos, JWT, UoW, outbox, SignalR | BCrypt.Net-Next 4.2.0, Npgsql.EFCore.PostgreSQL 9.0.4, System.IdentityModel.Tokens.Jwt 8.18.0 |
| `tests/YSocial.Domain.UnitTests` | Domain | xUnit 2.7.1, NSubstitute 5.3.0, FluentAssertions 8.3.0 | see §11 |

- All projects target `net8.0`; Api `Nullable` enabled
- **Source:** `YSocial.sln`, each `*.csproj`
- **Shared kernel:** `Microservice.BuildingBlocks.{CQRS,Domain}`

## 2. Mislead names

| Name | Reality | Source |
|---|---|---|
| `TransactionBehavior` | opens no transaction; calls `unitOfWork.CommitAsync` after handler, even when `Result` failed | `Application/CQRS/Behaviors/UnitOfWork/TransactionBehavior.cs` |
| `MockDataStore : DbContext` | static `ConcurrentDictionary` store; `SaveChangesAsync` returns `1` & persists nothing | `Infrastructure/Data/MockDataStore.cs` |
| `AddDbContext<MockDataStore>(UseNpgsql)` | registered, never queried; no EF query or migration in snapshot | `Infrastructure/DependencyInjection.cs` |
| `YSocialDbContext` | has only `DbSet<Post>`; its registration is commented out | `Infrastructure/Data/YSocialDbContext.cs`, `DependencyInjection.cs` |
| `EfNotificationOutboxService` | writes to in-memory `List`, no EF | `Infrastructure/Notifications/Outbox/EfNotificationOutboxService.cs` |
| `CQRS/Decorators/` | holds only `DummyNotification` (+ no-op handler); no decorator exists; Scrutor never called (`Decorate` count 0) | `Application/CQRS/Decorators/...` |
| `ClearCacheWhenUserUnblockedEventHandler`, `UserFollowRequestedEventHandler`, `InitializePostStatsHandler` | no-op or log only | `Application/Features/...` |
| `ErrorType.Business` | maps to HTTP 400, not domain exception | `Api/Controllers/ApiController.cs` |
| `Unauthorized` `Result` | produced inside handlers only; JWT middleware 401 has different (empty) body | §6 |

## 3. Request lifecycle

```
HTTP -> UseHttpsRedirection -> UseCors("YSocialCorsPolicy") -> UseAuthentication -> UseAuthorization
     -> MapControllers -> [Authorize]? -> model binding ([ApiController] auto-400)
     -> controller: Mediator.Send(cmd [, ct])
     -> ValidationBehavior -> LoggingBehavior -> MetricsBehavior -> TransactionBehavior -> handler
        (TransactionBehavior: next() -> UnitOfWork.CommitAsync -> DispatchEvents -> SaveChanges no-op)
     -> Result -> ApiController.HandleResult -> HTTP
```

- **Pipeline order:** registration order in `Application/DependencyInjection.cs`: `ValidationBehavior`, `LoggingBehavior`, `MetricsBehavior`, `TransactionBehavior`
- **Applicability:** `ValidationBehavior` & `TransactionBehavior` constrain `TRequest : ICommand<TResponse>`; `LoggingBehavior` & `MetricsBehavior` constrain `TRequest : notnull`
  - Commands (`ResultCommand*`) inherit `CommandBase` -> `RequestBase, ICommand`
  - Queries (`ResultQuery<T>` : `RequestBase<>`) -> Unverified whether `ICommand`; if not, query validators (`GetPostQueryValidator`, `GetPostsByUserIdQueryValidator`) are dead & queries skip commit
  - **Smallest probe:** `GET /api/posts/user/{id}?pageSize=1000` -> 200 means validation skipped; 400/500 means it ran
- **Validation:** all `IValidator<T>` run in parallel, errors merged, `throw new ValidationException(errors)` (not `Result`) -> see §5
- **Logging:** `LoggingBehavior` logs request & response objects at Information (`{@Command}`, `{@Response}`) -> request records (`LoginCommand`, `RegisterAccountCommand`, `ResetPasswordCommand`) carry passwords/OTP & `LoginResponse` carries tokens; rendering is framework-dependent; security debt
- **Metrics:** only stopwatch log line
- **Commit:** runs for every command, including ones that returned failed `Result`
- **No rollback:** repos mutate shared static dictionaries immediately; exception after mutation leaves state changed (§8)
- **Notification (event) pipeline:** domain events published with `mediator.Publish` sequentially per event; open-generic behaviors do not wrap notifications (`IPipelineBehavior` is request-only; MediatR convention)
- **Decorators:** none
- **Nested dispatch:** see §7

## 4. DI registration (`Infrastructure/DependencyInjection.cs`, `Application/DependencyInjection.cs`)

| Lifetime | Registrations |
|---|---|
| Singleton | all `Mock*Repository`, `IJwtProvider`, `IPasswordHasher`, `IUserIdProvider`, `MockNotificationOutboxStore` |
| Scoped | `IUserContext`, `IEmailSender`/`ISmsSender` (mocks), `INotificationOutboxService`, `IDataStorage`, `IDomainEventsProvider` (both -> `MockDataStore`), `IDomainEventsDispatcher`, `IUnitOfWork`, validators (FluentValidation default) |
| Transient | domain services `LikeToggleService`, `CommentPostingService`, `SavedItemToggleService`, `UserProfileService`, `UserRelationManager`; MediatR handlers (default) |
| Hosted | `ProcessNotificationOutboxJob` (polls every 1s) |

- **Assembly scanning:** `AddValidatorsFromAssembly(Application, includeInternalTypes: true)`; MediatR `RegisterServicesFromAssembly(Application)`; handlers are `internal sealed`
- **Overrides:** none; repositories are interface -> mock only (no alternative implementation registered)
- **Config reads:** `Jwt:SecretKey|Issuer|Audience` (hard-coded fallbacks in `Program.cs` & `JwtProvider.cs` -> security debt), `App:FrontendUrl` (fallback `https://ysocial.com`), `ConnectionStrings:DefaultConnection`
- **Hub:** `MapHub<NotificationHub>("/hubs/notifications")`

## 5. Errors, exceptions & `Result` mapping

### 5.1 `Result` -> HTTP (`Api/Controllers/ApiController.cs`)

| Outcome | HTTP | Body |
|---|---|---|
| `Result` success | 204 | none |
| `Result<T>` success, value non-null | 200 | raw `T` (no envelope) |
| `Result<T>` success, value null | 204 | none |
| `ErrorType.Validation` / `Business` / `None` | 400 | error object |
| `NotFound` | 404 | error object |
| `Conflict` | 409 | error object |
| `Unauthorized` | 401 | error object |
| `Forbidden` | 403 | error object |

- **Error object:** anonymous `{ Title, Detail, Status, Timestamp }`; JSON casing = MVC default camelCase
- **Swagger mismatch:** schema `ProblemDetails` lists `type|title|status|detail|instance`; `timestamp` missing, `type`/`instance` never sent
- **Outliers:** `LikesController`/`SavedItemsController` return `BadRequest("Invalid TargetType")` (plain string) when `TargetType` is null
- **`Result<bool>` commands** (UpdatePost, DeletePost, RestorePost, comment ops, profile ops) return 200 + `true`, never 204

### 5.2 Exceptions -> HTTP: NO mapping exists
- `Program.cs` has no `UseExceptionHandler`, `IExceptionHandler`, exception filter or `AddProblemDetails`; neither DI extension registers one
- Therefore these surface as **HTTP 500** (Development: exception page; Production: empty body):
  - `BusinessRuleValidationException` (every `CheckRule` failure; proven thrown by tests `UserRelationManagerTests`)
  - `FluentValidation.ValidationException` (`ValidationBehavior`)
  - `EntityNotFoundException` (`FollowUserAsync`, `MarkNotificationAsReadCommandHandler`)
- **Affected paths (examples):** non-author post edit/delete/restore | wrong password (`Account.Login`) | 6th active session (`DeviceSessionLimitRule`) | follow self/missing/deleted/blocked target | close-friend while not following | block self | content over limits | invalid OTP | restore of non-deleted post (`EntityMustBeDeletedToRestoreRule`) | register with email local part < 3 chars
- Swagger-declared 400/403/404 for these routes are therefore NOT what clients receive
- **Inconsistency:** unknown account on login -> `Result.Fail` 400, wrong password -> exception 500 (account enumeration + differing status)
- **Framework 400s:** `[ApiController]` automatic `ValidationProblemDetails` (malformed JSON, invalid enum int via `EnumerationJsonConverter`, missing non-nullable `[FromQuery] string username` via implicit required) -> third error shape
- **Routing 404:** `{id:guid}` constraint mismatch -> 404 with no body (framework default)
- **Auth 401/403:** JWT middleware/`[Authorize]` -> 401 empty body + `WWW-Authenticate`, 403 empty (framework default)
- Net: FE must handle 4 error shapes (handler object, `ValidationProblemDetails`, bare string, empty) plus HTML/text 500

## 6. Authentication, authorization & identity

### 6.1 JWT (`Api/Program.cs`, `Infrastructure/Identity/JwtProvider.cs`)
- Scheme `JwtBearer`; validates issuer, audience, lifetime & signing key (HS256, symmetric); `DefaultMapInboundClaims = false` (claim names kept as issued)
- **Claims:** `sub` = **AccountId** | `user_id` = **UserId (profile)** | `email` | `jti`; no role claim, no profile username
- **Lifetime:** access token & refresh token 7 days (`Account.DefaultRefreshTokenExpiryDays`)
- **No revocation check:** tokens stay valid after logout/account delete/password change until expiry (no per-request account or user lookup)
- **SignalR:** token accepted from query `access_token` only for paths starting `/hubs`
- **Dev only:** `Program.cs` logs admin JWT & injects it into Swagger UI (`/swagger-custom.js`) under `IsDevelopment()`; value not recorded here

### 6.2 `IUserContext` (`Infrastructure/Identity/UserContext.cs`)
- `UserId` <- claim `user_id`; `AccountId` <- claim `sub`; `Email`; `IsAuthenticated`
- Missing/invalid claim -> `Guid.Empty` (no throw); unauthenticated callers reach handlers with empty ids

### 6.3 Where authorization is enforced

| Surface | `[Authorize]` | Handler `IsAuthenticated` check |
|---|---|---|
| `PostsController`: POST, PUT, DELETE, restore, share-link | yes | yes (except share-link: no repo, no check) |
| `PostsController`: GET `{id}`, GET `user/{userId}` | no | none (anonymous read) |
| `UserBlocksController`, `UserRelationsController` | controller-level | none (rely on attribute) |
| `CommentsController`, `LikesController`, `SavedItemsController` | no | yes -> 401 body |
| `IdentitiesController` (all) | no | `DeleteAccount` yes; `Logout` returns 400 (`Fail`) when unauthenticated |
| `UsersController` (all) | no | none -> anonymous gets 404 (`UpdateProfile`, `DeleteProfile`, `SwitchProfile`) or 500 (`SetDefaultProfile`: rule on empty profile list) |
| `NotificationHub` | yes | n/a |

- `ApiController` has `[Authorize]` commented out -> default is anonymous
- No role/policy authorization anywhere; `Account.Role` (`UserRole`) is never read by auth code
- **Ownership checks** live in domain rules: `OnlyAuthorCanPerformActionOnPostRule`, `OnlyAuthorCanEditCommentRule`, `OnlyAuthorOrPostOwnerCanDeleteCommentRule`, `OnlyDeleterCanRestoreCommentRule`, `OnlyRecipientCanReadNotificationRule` -> violation = exception = 500 (§5.2)

### 6.4 Session lifecycle
- **Login:** `LoginCommand(LoginId, Password, DeviceId)`; `LoginId` = email | phone | username (mock repo heuristics: contains `@` -> email; leading `+` or digits/space/dash -> phone; else username); profile used for token = profile whose username equals `LoginId`, else default profile (`UserProfileService.ResolveProfile`)
- Response `LoginResponse(AccessToken, RefreshToken, RefreshTokenExpiry)`; **no user id/profile in body** -> FE must decode `user_id` from JWT
- **Refresh tokens:** opaque GUID strings stored on `Account.RefreshTokens`; max **5 active** (`DeviceSessionLimitRule`, 6th login throws -> 500); expired/revoked tokens purged on next login
- **Refresh endpoint:** `Not found`. Only rotation path = `PUT /api/users/profiles/switch` (`Account.RotateRefreshToken`), which itself needs valid access token
- **Logout defect:** `LogoutUserCommandHandler` builds `new AccountId(userContext.UserId)` (profile id used as account id) -> account lookup misses -> `NotFound` 404 "Account not found" -> refresh token never revoked
  - Combined with 5-session cap: client logs in repeatedly without working revoke is locked out until process restart
- **Password reset:** `forgot-password` always 204, also for unknown ids; OTP 6 digits, bcrypt-hashed, 15 min, max 5 attempts; delivery = `MockEmailSender`/`MockSmsSender` (log only, includes OTP); reset revokes all refresh tokens
- **Register:** returns `AccountId` only (no tokens); username = email local part, **no uniqueness check**, can't choose or change it later (§ domain-model)
- **Delete account:** soft-delete + revoke refresh tokens + event removes all profiles; existing access tokens remain usable (§6.1)

## 7. Unit of Work, persistence & domain events

### 7.1 Commit sequence (`Infrastructure/Persistence/UnitOfWork/UnitOfWork.cs`, `DomainEventsDispatcher.cs`)
1. Handler mutates aggregates through singleton mock repos (immediate, in-process)
2. `TransactionBehavior` -> `UnitOfWork.CommitAsync`
3. `DomainEventsDispatcher`: `GetAllDomainEvents()` snapshot -> `ClearAllDomainEvents()` -> `Publish` each event sequentially
4. `SaveChangesAsync` (no-op)

### 7.2 Dispatch defects
- **Scan gap:** `MockDataStore.GetAllDomainEvents`/`ClearAllDomainEvents` iterate only `Accounts, Users, Posts, Likes, Comments, SavedItems`; `UserRelations`, `UserBlocks`, `Notifications` are never scanned
  - **Consequence:** `UserFollowRequestedEvent`, `UserFollowAcceptedEvent`, `UserUnfollowedEvent`, `UserBlockedEvent`, `UserUnblockedEvent` are **never dispatched** -> follower/following counts never change, follow notifications never created, blocking does not purge follows (contradicts `user-profile-and-relations.md` §2.1)
- **Lost event on unlike:** `Like.Remove()` adds `LikeRemovedEvent`, then `MockLikeRepository.Remove` does `TryRemove` before commit -> aggregate no longer in `Likes.Values` -> event lost -> `Post.LikeCount`/`Comment.LikeCount` only increase
  - Soft-deleted aggregates (Post, Comment, SavedItem, Account) stay in dictionaries, so their delete events do dispatch
- **Single pass:** events raised inside handlers (e.g. `RemoveSavedItemsWhen*` -> `SavedItem.Remove()`) are not re-collected; they stay on static aggregates & dispatch in **next unrelated commit** (any request)
- **Process-global:** provider scans static dictionaries, not request-tracked entities; snapshot+clear is not atomic -> concurrent commits can double-publish or steal events
- **Ordering:** events published grouped by aggregate type (Accounts, Users...), not chronologically
- **Failure semantics:** handler exception -> 500, earlier mutations stay (no rollback). Example: `RegisterAccountCommandHandler` adds account, then `InitializeUserProfileHandler` (on commit) throws for local part < 3 chars -> **orphan account** (email taken -> later 409; login -> "No user profile found")

### 7.3 Persistence reality
- State = static `ConcurrentDictionary` fields on `MockDataStore`; seed: 3 accounts, 4 profiles (1 account has 2), 2 posts (`SeedMockData`; seed credentials are hard-coded there, not reproduced here)
- Soft vs hard `Remove`: soft-delete is performed by domain method; mock `Remove` just re-stores entity for Account, Comment, Post, SavedItem, UserRelation, User; **hard** removal for Like, Notification, UserBlock
- No unique constraints (follow, like...) beyond application checks; queries are full scans
- `appsettings`/connection string/migrations: Not found
- `AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true)` is set but irrelevant until real DB exists

### 7.4 Notifications pipeline
- Handlers (`CreateNotificationWhenLiked`, `...CommentCreated`, `...FollowRequested`, `...FollowAccepted`) create `Notification` & enqueue to in-memory outbox; `ProcessNotificationOutboxJob` pushes `ReceiveNotification` via `IHubContext` to `Clients.User(recipientId)` every second; nothing is ever removed from outbox list
- **Live today:** like & comment notifications (their aggregates are scanned); **dead:** both follow notifications (§7.2)
- Self notifications are created (`CannotSendNotificationToYourselfRule` call is commented out in `Notification.Create`)
- Hub user id = claim `user_id` -> only connection of active profile receives it
- Payload `NotificationPayload { Id, Type, Title, Content, MetaData, RecipientId }` (SignalR JSON protocol -> camelCase); type names `FollowRequested|FollowAccepted|NewComment|NewLike`
- **No HTTP endpoint** to list notifications or mark as read (`MarkNotificationAsReadCommand` has no controller; it throws instead of returning `Result`)

## 8. Cross-cutting API behavior
- **Routing:** `api/[controller]` + `LowercaseUrls`; Users/UserRelations/UserBlocks override routes (`api/users/{targetId}/relations`, `api/users/{targetId}/blocks`)
- **JSON:** System.Text.Json; only addition is `EnumerationJsonConverterFactory` -> every `Enumeration<T>` reads/writes as **integer** (strings rejected -> auto 400); strongly-typed IDs use generated `SystemTextJson` converter (expected GUID string)
- **CORS:** policy `WithOrigins("http://localhost:3000")` followed by `SetIsOriginAllowed(_ => true)` + `AllowCredentials` -> effectively **any origin with credentials** (security debt; e `WithOrigins` call is moot)
- **HTTPS:** `UseHttpsRedirection` active; port/launch profile (FE hard-codes `https://localhost:49895`)
- **Cancellation:** only `UserBlocksController` & `UserRelationsController` accept/forward `CancellationToken`; all other controllers call `Mediator.Send(cmd)` without one; mock repos ignore tokens anyway
- **Pagination:** 1 endpoint only (`GET /api/posts/user/{userId}`): `page` (1-based, default 1), `pageSize` (default 10, validator 1..50 if validator runs), newest first, offset-based; `PagedList{Items,Page,PageSize,TotalCount,TotalPages,HasNextPage,HasPreviousPage}`
- **Rate limiting, health checks, request size limits, structured logging:** Not found

## 9. Implementation boundaries (what exists vs not)
- **Use-case-less domain behavior (no handler/endpoint):** `UserRelation.AcceptFollow`, `UserRelation.ToggleMute`, `User.UpdatePrivacySettings`, `Post.UpdateSettings`, `Account.Deactivate/Activate/AssignRole/ChangePassword`, `IUserRepository.GetByUsernameAsync/IsEmailUniqueAsync`, `INotificationRepository.GetByRecipientIdAsync`
- **Not found (no code):** profile GET (by id/username), search, feed/timeline, comments list, followers/following lists, follow-request list/approve/decline, mute endpoint, privacy-setting endpoint, create-profile, notifications list/read, hashtags/mentions, reposts, pin, hide-like-count, media upload, DMs, refresh-token endpoint, session list
- **Planned (comments/dead code only):** EF Core + PostgreSQL (`YSocialDbContext`, outbox `jsonb` config, commented queries), cache/search-index hooks, push-notification service, `UserMustNotBeBlockedRule` for comments (comment in `CommentPostingService`)

## 10. Known limitations & technical debt (ranked)
1. Exceptions -> 500 for all domain/validation failures (§5.2)
2. Relation/block events never dispatched; unlike event lost (§7.2)
3. Logout always 404 + 5-session cap = lockout (§6.4)
4. No refresh endpoint; 7-day access token; no revocation (§6)
5. Text-only post creation fails (`CreatePostCommandValidator` requires `ImageUrl`; failure -> 500) -> see mapping doc
6. No read path enforces visibility, privacy or blocks (Posts, Saved)
7. Credentials/OTP/tokens logged (`LoggingBehavior`, `MockEmailSender`)
8. Hard-coded JWT secret fallback, permissive CORS
9. In-memory only; non-atomic cross-request event handling
10. Username uniqueness absent; orphan-account path on register
11. Validators on queries & `ICommand` applicability `Unverified`
12. Handlers using `Task.WhenAll` over same repo/DbContext (`FollowUserAsync`, `RemoveFollowsWhenUserBlocked`, `AddComment`) are safe on mock store but will break on single EF `DbContext` (inference, `Unverified`)
13. `MockDataStore.SeedMockData` & Swagger dev token logging ship in same binary (Development-gated for token, seed always on)

## 11. Tests
- Single project `tests/YSocial.Domain.UnitTests`, 5 files, all under `UserRelations`: 3 rule tests, `UserRelationTests` (create, RequestFollow idempotency/restore, AcceptFollow, ToggleCloseFriend, ToggleMute, Delete incl. no unfollow event when Pending), `UserRelationManagerTests` (follow/unfollow/block/unblock/close-friend with NSubstitute repos)
- **Not covered:** Account/Post/Comment/Like/SavedItem/User domain, every Application handler, pipeline behaviors, controllers, dispatcher/UoW, mock repos -> cannot detect findings in §7.2
- `.context/features/backend-unit-test.md` describes larger matrix (Application handlers etc.) -> **deviation**: only UserRelations slice exists in snapshot

## 12. Evidence ledger & smallest next probes

| Claim | Status | Smallest probe |
|---|---|---|
| Domain exceptions throw (`CheckRule`) | Verified (tests assert `ThrowAsync<BusinessRuleValidationException>`) | none |
| Exceptions return 500 | Verified absence of handler; body `Partially verified` | `PUT /api/posts/{id}` as non-author, inspect status |
| `DomainEvent : INotification` | Verified (compile constraint in `INotificationHandler<...>` usage) | none |
| Behavior order | Partially verified | log line order from 1 command (Logging "Handling" precedes "Finished in") |
| Queries skip Validation/Transaction | Unverified | `pageSize=1000` probe (§3) |
| `sub` claim readable as `AccountId` | Partially verified (`DefaultMapInboundClaims=false`) | `PUT /api/users/profiles/switch` with bogus refresh token: 404 profile/account vs 500 rule |
| JSON camelCase & enum ints | Partially verified | `POST /api/likes/toggle` response shape |
| `appsettings` values, ports | Unverified | add `appsettings.Development.json` (secrets redacted) & `launchSettings.json` to snapshot |
| `IRepository`, `CommandBase`, `Enumeration<T>` shapes | Unverified | add `Microservice.BuildingBlocks` to snapshot |

## 13. Deviations from existing docs
- `conventions/backend.md`: claims `AnyAsync` high-frequency block checks & EF migration target as current -> mock `FirstOrDefault` scans; EF is planned only. Aggregate list omits Post, Comment, Like, SavedItem, Notification
- `features/user-profile-and-relations.md`: endpoint table wrong (real routes `/api/users/{targetId}/relations/follow`, `/relations/close-friend`, `/blocks`; profile edit = `PUT /api/users/profiles/me`; `GET /api/users/@{username}` does not exist; follow returns bare status string, not `{ followStatus }`); event pipeline & block purge claimed as working but never dispatched (§7.2); "Event-Driven Pipeline" describes handlers that are registered but unreachable
- `features/identities.md`: lists Deactivate/Activate & Change password as lifecycle features -> no use case/endpoint; "refresh token rotation" -> only via switch-profile, no refresh endpoint
