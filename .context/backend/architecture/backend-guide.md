---
module: Backend Implementation
stack: ASP.NET Core 8 / MediatR 14 / FluentValidation 12 / in-memory store
updated: 2026-10-16
---

# BACKEND GUIDE

## 0. Scope
- **Paths:** repo-relative (`src/...`, `tests/...`); BE root = repo root (`YSocial.sln`). Shared kernel = sibling repo `Microservice.BuildingBlocks` (own snapshot; paths cited as `BB:Domain/...`, `BB:CQRS/...` under its `src/Microservice.BuildingBlocks.*`)
- **Companions:** domain detail in `domain-model.md` | FE contract (endpoints, error codes, DTOs) in `../integration/frontend-backend-mapping.md` | recovery plan & decisions D1-D20 in `../plans/2026-10-15-backend-recovery-&-fe-integration.md`
- **Generic conventions** (strongly-typed IDs, `IBusinessRule`, `IClassifiedRule`, `Result`, projectors, access gates) in `.context/conventions/backend.md`
- **Architecture:** Clean Architecture & DDD
- **State (2026-10-15):** BE recovery implemented (T0-T4: auth, reads, graph, mute, feed, notifications, security hardening); NOT production-ready: in-memory store, process-global events, no rollback (§7.2, §10)

## 1. Solution & project map

| Project | Refs | Role | Key packages |
|---|---|---|---|
| `src/YSocial.Api` | Application, Infrastructure | controllers, `Program.cs`, error pipeline, JSON/Swagger plumbing | JwtBearer 8.0.26, Swashbuckle 6.6.2 |
| `src/YSocial.Application` | BuildingBlocks.CQRS, Domain | commands, queries, behaviors, projectors, access policy, event handlers | MediatR 14.1.0, FluentValidation 12.1.1 |
| `src/YSocial.Domain` | BuildingBlocks.Domain | aggregates, rules, events, repo contracts, error catalog | StronglyTypedId 0.2.1, CommunityToolkit.Common 8.4.0 |
| `src/YSocial.Infrastructure` | Application | mock repos, JWT, UoW, outbox, SignalR, session lock | BCrypt.Net-Next 4.2.0, Npgsql.EFCore.PostgreSQL 9.0.4, System.IdentityModel.Tokens.Jwt 8.18.0 |
| `tests/YSocial.Domain.UnitTests` | Domain | xUnit 2.7.1, NSubstitute 5.3.0, FluentAssertions 8.3.0 | see §11 |
| `tests/YSocial.Application.UnitTests` | Application, Domain, Infrastructure | same stack | see §11 |
| `tests/YSocial.Api.IntegrationTests` | Api, Domain | same stack + `Microsoft.AspNetCore.Mvc.Testing` 8.0.26 | see §11 |

- All projects target `net8.0`; Api `Nullable` enabled; `InternalsVisibleTo` for test projects on Domain, Application, Infrastructure
- **Source:** `YSocial.sln`, each `*.csproj`
- **Shared kernel:** `Microservice.BuildingBlocks.{CQRS,Domain}`, net8.0; CQRS refs Domain (MediatR 14.1.0, FluentValidation 12.1.1 unused there); Domain uses MediatR.Contracts 2.0.1; NOT modified by recovery
  - `IRepository<T,TId>`: `UnitOfWork`, `GetByIdAsync(id[, includeDeleted], ct)`, `AddAsync`, `Update`, `Remove` (`BB:Domain/Repositories/IRepository.cs`)
  - `Entity.CheckRule` & `ValueObject.CheckRule` throw `BusinessRuleValidationException` when `BrokenWhen`; exception exposes `BrokenRule` (rule instance) & `Details` (`BB:Domain/Entities/Entity.cs`)
  - `IDomainEvent : INotification`; `AggregateRoot<TId>` holds `DomainEvents`, `ClearDomainEvents()`, protected `AddDomainEvent` (ineffective null guard: `ThrowIfNull` receives string)
  - `Enumeration<T>.FromValue(int)` returns null for unknown values; `GetAll()` reflects declared public static fields
  - Unused: `EventSourcedAggregateRoot`, `Event`/`IEvent`, `UnknownEventException`, `QueryBase`/`IQuery`/`IQueryHandler`

## 2. Mislead names

| Name | Reality | Source |
|---|---|---|
| `TransactionBehavior` | opens no transaction; commits (`UnitOfWork.CommitAsync`) only successful commands; failed `Result`/exception -> skip commit & discard pending events (§7.1) | `Application/CQRS/Behaviors/UnitOfWork/TransactionBehavior.cs` |
| `MockDataStore : DbContext` | static `ConcurrentDictionary` store; `SaveChangesAsync` returns 1, persists nothing; also implements `IDomainEventsProvider` & `IPendingDomainEvents` | `Infrastructure/Data/MockDataStore.cs` |
| `AddDbContext<MockDataStore>(UseNpgsql)` | registered, never queried; no EF query or migration | `Infrastructure/DependencyInjection.cs` |
| `YSocialDbContext` | has only `DbSet<Post>`; its registration is commented out | `Infrastructure/Data/YSocialDbContext.cs`, `DependencyInjection.cs` |
| `EfNotificationOutboxService` | writes to in-memory `List`, no EF (processor deletes delivered messages) | `Infrastructure/Notifications/Outbox/EfNotificationOutboxService.cs` |
| `InitializePostStatsHandler` | logs only (runs, does nothing else) | `Application/Features/Posts/CreatePost/EventHandlers/` |
| `ErrorType.Business` | maps to HTTP 400 `BusinessRuleViolated`, not domain exception | `Api/Controllers/ApiController.cs` |
| `IUserContext.UserId` | profile id (JWT `user_id`), NEVER account id; `GetViewerId()` = null for anonymous | §6.2 |
| `MockDataStore.ResetForTests()` | test-only, in-place clear + reseed; never called by production code | `Infrastructure/Data/MockDataStore.cs` |

## 3. Request lifecycle

```
HTTP -> UseExceptionHandler (GlobalExceptionHandler) -> UseStatusCodePages -> [Development: Swagger] -> UseHttpsRedirection
     -> UseCors("YSocialCorsPolicy") -> UseAuthentication -> UseAuthorization
     -> MapControllers -> [Authorize]? -> model binding ([ApiController]; invalid -> ProblemDetails `ValidationFailed`)
     -> controller: Mediator.Send(request [, ct])
     -> ValidationBehavior -> LoggingBehavior -> MetricsBehavior -> TransactionBehavior (commands only) -> handler
        (TransactionBehavior: next() ok -> UnitOfWork.CommitAsync -> dispatch loop -> SaveChanges no-op;
         exception | failed Result -> discard pending events, NO commit)
     -> Result -> ApiController.HandleResult | HandleCreated -> HTTP (errors: RFC 7807 ProblemDetails, §5)
```

- **Pipeline order:** registration order in `Application/DependencyInjection.cs`: `ValidationBehavior`, `LoggingBehavior`, `MetricsBehavior`, `TransactionBehavior`
- **Applicability:** `ValidationBehavior` constrains `TRequest : IRequest<TResponse>` (commands & queries, T1.2); `TransactionBehavior` constrains `TRequest : ICommand<TResponse>`; `LoggingBehavior` & `MetricsBehavior` constrain `TRequest : notnull`
  - **Commands** (`ResultCommand*` -> `CommandBase<>` -> `ICommand<>`): all 4 behaviors apply
  - **Queries** (`ResultQuery<T>`): validated, logged, timed; NEVER commit (no `UnitOfWork.CommitAsync`, no event dispatch)
  - Query handlers implement `IRequestHandler` (not `IQueryHandler`)
- **Pagination bounds:** shared `PaginationRules` (`page >= 1`, `1 <= pageSize <= 50`) on every list query -> 400 `ValidationFailed` (conventions/backend.md)
- **Validation:** all `IValidator<T>` run in parallel, errors merged, `throw new ValidationException(errors)` -> mapped by `GlobalExceptionHandler` to 400 + `errors` (§5.2)
- **Logging:** `LoggingBehavior` logs `LogRedactor.Describe(request|response)` at Information; members named `*password*`, `*otp*`, `*token*`, `*secret*` or marked `[SensitiveData]` print `***` (also inside `Result<T>` & nested objects); compiler `ToString()` of requests is NEVER logged (T4.3). Any new secret-bearing member MUST follow naming rule or carry attribute
- **Metrics:** only stopwatch log line
- **No rollback:** repos mutate shared static dictionaries immediately; failure after mutation leaves state changed (§7.2)
- **Notification (event) pipeline:** domain events published with `mediator.Publish` sequentially per event; open-generic behaviors do not wrap notifications (`IPipelineBehavior` is request-only; MediatR convention)
- **Decorators:** none
- **Nested dispatch:** see §7

## 4. DI registration

> `Infrastructure/DependencyInjection.cs`
> `Application/DependencyInjection.cs`

| Lifetime | Registrations |
|---|---|
| Singleton | all `Mock*Repository`, `JwtSettings` (instance from `Program.cs`), `IJwtProvider`, `IPasswordHasher`, `IAccountSessionLock` (`AccountSessionLock`), `IUserIdProvider`, `MockNotificationOutboxStore` |
| Scoped | `IUserContext`, `IEmailSender`/`ISmsSender` (mocks), `INotificationOutboxService`, `IDataStorage` / `IDomainEventsProvider` / `IPendingDomainEvents` (all 3 -> `MockDataStore`), `IDomainEventsDispatcher`, `IUnitOfWork`, `IViewerAccessPolicy`, `UserProfileProjector`, `PostProjector`, `InteractionGuard`, `AccessibleFollowRequests`, `NotificationPublisher`, `AccessibleNotifications`, `NotificationOutboxProcessor`, validators (FluentValidation default) |
| Transient | domain services `LikeToggleService`, `CommentPostingService`, `SavedItemToggleService`, `UserProfileService`, `UserRelationManager`; MediatR handlers (default) |
| Hosted | `ProcessNotificationOutboxJob` (runs 1 `NotificationOutboxProcessor` batch every 1s; removed by test host) |

- **Assembly scanning:** `AddValidatorsFromAssembly(Application, includeInternalTypes: true)`; MediatR `RegisterServicesFromAssembly(Application)`; handlers, projectors & `InteractionGuard` are `internal sealed`
- **Overrides:** none in production; repositories are interface -> mock only (no alternative implementation registered)
- **Config reads:** `Jwt:SecretKey|Issuer|Audience|AccessTokenMinutes` read ONCE by `JwtSettings.FromConfiguration` in `Program.cs` (singleton; key >= 32 chars REQUIRED outside Development, startup fails otherwise; Development falls back to constant `JwtSettings.DevelopmentSecretKey`; `AccessTokenMinutes` default 15), `Cors:AllowedOrigins` (array; `appsettings.json` empty, `appsettings.Development.json` = FE dev origin), `App:FrontendUrl`, `ConnectionStrings:DefaultConnection` (empty)
- **Hub:** `MapHub<NotificationHub>("/hubs/notifications")`

## 5. Errors, exceptions & `Result` mapping

> Single envelope builder: `Api/Infrastructure/Errors/ApiProblems.cs`; exception mapping: `GlobalExceptionHandler.cs`. Published code list & per-endpoint statuses: `../integration/frontend-backend-mapping.md` (MAP §1, §2)

### 5.1 Envelope (D1)
- **Shape:** RFC 7807 `ProblemDetails` (`application/problem+json`) on EVERY error: `type`, `title`, `status`, `detail`, `instance`, extensions `code` (stable, from `Domain/Common/Errors/ErrorCodes.cs`) & `traceId`; validation problems add `errors: { field: string[] }` (camelCase keys)
- **Builders:** `ApiProblems.Create` (all errors), `Enrich` (fills missing fields of framework-generated problems), `ToResult` (controller results), `CodeFor(status)` (default code per status)
- **Source of codes:** catalog constants only, NEVER class names (D2); `CodesSnapshot_MatchesApprovedList` pins list (rename = contract change via MAP)

### 5.2 Mapping table

| Source | Condition | HTTP | `code` |
|---|---|---|---|
| `Result` | `ErrorType.Validation` / `Business` | 400 | `ValidationFailed` / `BusinessRuleViolated` (or explicit `Result.*(msg, code)`) |
| `Result` | `Unauthorized` / `Forbidden` / `NotFound` / `Conflict` | 401 / 403 / 404 / 409 | `Unauthenticated` / `Forbidden` / `NotFound` / `Conflict` (or explicit) |
| `Result` | failure with `ErrorType.None` (bug) | 500 | `InternalError` |
| `ValidationException` (FluentValidation) | any failing validator | 400 | `ValidationFailed` + `errors` |
| `BusinessRuleValidationException` + `IClassifiedRule` | `Kind`: Invalid 400, Forbidden 403, NotFound 404, Conflict 409, Unauthorized 401 | per Kind | rule `Code` |
| `BusinessRuleValidationException` | unclassified rule / string ctor | 400 | `BusinessRuleViolated` |
| `EntityNotFoundException` | any | 404 | `NotFound` |
| any other exception | unexpected | 500 | `InternalError` (`detail` generic outside Development; logged at Error) |
| framework | model binding, malformed JSON, bad enum int (`InvalidModelStateResponseFactory`) | 400 | `ValidationFailed` + `errors` |
| framework | JWT missing/invalid on `[Authorize]` / authorization denied / route not matched (`UseStatusCodePages`) | 401 / 403 / 404 | `Unauthenticated` / `Forbidden` / `NotFound` |
| framework | wrong HTTP method on known route / body content type not JSON (`UseStatusCodePages`) | 405 / 415 | `MethodNotAllowed` / `UnsupportedMediaType` |

- **Result -> success:** `Result` -> 204 | `Result<T>` non-null -> 200 raw `T` (no envelope) | `Result<T>` null -> 204 | `HandleCreated` -> 201 + optional `Location` (D7)
- **`ValidationBehavior` exceptions & rule exceptions never reach controller:** `UseExceptionHandler` -> `GlobalExceptionHandler`; 5xx logged, 4xx logged at Information
- **Hidden-entity rules:** `Kind = NotFound` rules (blocked/deleted target) answer generic `detail` "Resource not found." (no naming of hidden entities, D14)
- **Rule-thrown `ValidationFailed`** (`EmailMustBeValidRule`, `PhoneNumberMustBeValidRule`, Likes id rules) has NO `errors` map (only validator failures do)
- **Other framework statuses:** `ApiProblems.CodeFor` still answers `InternalError` for statuses not listed above (none produced today)
- **Test-only host:** `TestProbeController` (registered by `ApiFactory`) pins each generic row

## 6. Authentication, authorization & identity

### 6.1 JWT (`Api/Program.cs`, `Infrastructure/Identity/JwtProvider.cs`)
- Scheme `JwtBearer`; validates issuer, audience, lifetime & signing key (HS256, symmetric); `DefaultMapInboundClaims = false` (claim names kept as issued)
- **Claims:** `sub` = AccountId | `user_id` = UserId (profile) | `email` | `jti`; no role claim, no profile username
- **Lifetime:** access token 15 min (`Jwt:AccessTokenMinutes`); refresh token 7 days (`Account.DefaultRefreshTokenExpiryDays`)
- **No revocation check:** issued access tokens stay valid after logout/rotation/account delete/password change until expiry (D6, accepted; <= 15 min window); no per-request account or user lookup
- **SignalR:** token accepted from query `access_token` only for paths starting `/hubs`
- **Dev only:** `Program.cs` logs admin JWT & sample posts, injects token into Swagger UI (`/swagger-custom.js`) & seeds mock data (`MockSeedOptions.Enabled = IsDevelopment()`) ONLY under Development; value not recorded here
- **Secret:** no fallback outside Development (`JwtSettings`, §4; shipped dev key & old hard-coded key are rejected there); `Production_MissingJwtSecret_FailsStartup` pins it; `appsettings.Development.json` is git-ignored, so Development key lives in code

### 6.2 `IUserContext` (`Infrastructure/Identity/UserContext.cs`)
- `UserId` <- claim `user_id`; `AccountId` <- claim `sub`; `Email`; `IsAuthenticated`
- Missing/invalid claim -> `Guid.Empty` (no throw)
- **Viewer identity for reads:** `UserContextExtensions.GetViewerId()` = `UserId?` (null = anonymous); NEVER `AccountId`

### 6.3 Where authorization is enforced

| Surface | `[Authorize]` | Handler `IsAuthenticated` check |
|---|---|---|
| `IdentitiesController` | `DELETE account` only | register, login, refresh-token, logout, forgot/reset: anonymous by design |
| `PostsController` | POST, PUT, DELETE, restore, share-link | yes (share-link: none) |
| `PostsController` | GET `{id}`, GET `user/{userId}` | anonymous reads; optional viewer from JWT |
| `ThreadsController` | none | anonymous read; optional viewer |
| `UsersController` | per action on every write & `me*` read (`me`, `me/follow-requests[/count]`, `me/relation-sets`, `me/blocks`, `me/mutes`, `profiles/*`) | handler also checks |
| `UsersController` | GET `{id}`, `by-username/{username}`, `{id}/followers`, `{id}/following` | anonymous reads; optional viewer |
| `UserBlocksController`, `UserRelationsController` | controller-level | none (rely on attribute) |
| `CommentsController`, `LikesController`, `SavedItemsController` | none | yes -> 401 `Unauthenticated` body |
| `FeedController` | none | `forYou` anonymous (optional viewer); `following` -> 401 in handler |
| `NotificationsController` | controller-level | handlers use `GetViewerId()` |
| `NotificationHub` | yes | n/a |

- `ApiController` has `[Authorize]` commented out -> default is anonymous; `[Authorize]` MUST be per action on `UsersController` writes, NEVER controller-level (reads stay anonymous)
- No role/policy authorization; `Account.Role` (`UserRole`) is never read by auth code
- **Ownership checks** live in domain rules -> classified 403: `OnlyAuthorCanPerformActionOnPostRule`, `OnlyAuthorCanEditCommentRule`, `OnlyAuthorOrPostOwnerCanDeleteCommentRule`, `OnlyDeleterCanRestoreCommentRule`, `OnlyRecipientCanReadNotificationRule`
- **Read gate:** `IViewerAccessPolicy` (block/privacy/visibility, §4.4 of plan); **write gate:** `InteractionGuard` (like, bookmark; comment path via projector) -> hidden target = 404; see conventions/backend.md
- **Delete/restore of posts & comments:** `InteractionGuard.IsPostHiddenFromAsync` / `IsCommentHiddenFromAsync` answer 404 BEFORE ownership 403 for outsiders (hidden, blocked or deleted target); participants (author, post owner) still reach domain rules (403 only for visible targets)

### 6.4 Session lifecycle
- **Login:** `LoginCommand(LoginId, Password, DeviceId)`; `LoginId` = email | phone | username (heuristics: contains `@` -> email; leading `+` or digits/space/dash -> phone; else username); profile used for token = profile whose username equals `LoginId`, else default profile (`UserProfileService.ResolveProfile`)
  - **Order (D3):** account lookup -> password verify (unknown account runs 1 dummy bcrypt verify) -> only then `EnsureCanLogin` (`403 AccountInactive`) -> profile resolve -> token
  - **Failures:** unknown account, deleted account & wrong password -> identical `401 InvalidCredentials`; inactive account + wrong password -> 401 (state revealed ONLY to credential holder)
  - Response `LoginResponse(AccessToken, RefreshToken, RefreshTokenExpiry)`; **no user id/profile in body** -> FE decodes `user_id` from JWT (or calls `GET /api/users/me`)
- **Refresh tokens:** opaque GUID strings stored on `Account.RefreshTokens` (copy-on-write list: replaced wholesale, lock-free readers see stable snapshot); each token bound to profile (`RefreshToken.UserId`) & linked to its successor (`ReplacedByTokenId`, token family)
  - **Cap (D4):** max `Account.MaxActiveSessions` = 5 active; 6th login evicts (revokes) oldest active token, no error (`DeviceSessionLimitRule` removed)
  - **Purge:** expired/revoked tokens dropped on next login, EXCEPT rotated tokens whose family still has active member (so logout of old token still finds it)
- **Refresh (D5):** `POST /api/identities/refresh-token {refreshToken}` anonymous -> 200 `LoginResponse`; token must exist, be active (not expired/revoked/rotated), account active & not deleted, bound profile exists & not deleted -> rotate (old revoked, `ReplacedByTokenId` set) else `401 InvalidRefreshToken`; stays bound to same profile
- **Logout:** `POST /api/identities/logout {refreshToken}` anonymous; ALWAYS 204 for active, unknown, revoked, expired or rotated tokens (empty body -> 400 `ValidationFailed`); rotated token -> its active descendants are revoked too (logout ends session it names); issued access tokens stay valid until expiry
- **Switch profile:** `PUT /api/users/profiles/switch {profileId, refreshToken}` ([Authorize]): foreign, deleted or unknown profile -> 403 `ProfileNotOwned` (no id probing); token of another account / inactive -> 401 `InvalidRefreshToken`; rotation binds successor to target profile
- **Password reset:** `forgot-password` always 204, also for unknown ids; OTP 6 digits, bcrypt-hashed, 15 min, max 5 attempts; delivery = `MockEmailSender`/`MockSmsSender` (log only, includes OTP; OPEN debt T4.3); wrong/missing OTP -> 400 `InvalidOtp`, attempts exhausted -> 400 `OtpAttemptsExceeded`; unknown loginId on reset -> 400 `BusinessRuleViolated`; reset revokes all refresh tokens
- **Register:** `RegisterAccountCommand(Email, Password, Username, PhoneNumber?)` -> 201 `{accountId}`, no tokens; validator = FORMAT only (username `^[a-z0-9._]{3,30}$`, email, password >= 6 -> 400); handler = uniqueness BEFORE account creation (`409 EmailTaken`, `409 UsernameTaken`; case-insensitive; deleted accounts/profiles keep their email/username reserved) -> no orphan account; username flows via `AccountCreatedEvent` to first (default) profile
- **Delete account:** soft-delete + revoke all refresh tokens + event soft-deletes all profiles; existing access tokens remain usable (§6.1); posts/relations/comments remain but are hidden (profile deleted -> D20)

#### Session lock (D4-D6, plan §4.3)
- **Mechanism:** `IAccountSessionLock` (Application abstraction; `AccountSessionLock` singleton = `ConcurrentDictionary<AccountId, SemaphoreSlim(1,1)>`); NO other lock touches `Account` refresh tokens
- **Covered paths (ALL refresh-token list mutations):**

| Path | Handler | Notes |
|---|---|---|
| login | `LoginCommandHandler` | cleanup, eviction, add token |
| refresh | `RefreshTokenCommandHandler` | token-keyed: lock-free lookup, lock, re-read & re-validate |
| logout | `LogoutUserCommandHandler` | token-keyed, same pattern |
| switch profile | `SwitchProfileCommandHandler` | rotation under lock |
| reset password | `ResetPasswordCommandHandler` | `RevokeAllRefreshTokens` |
| delete account | `DeleteAccountCommandHandler` | `RevokeAllRefreshTokens` |

- **Rule for new code:** any future path mutating `Account.RefreshTokens` MUST acquire lock; review = grep `RefreshToken` mutators vs `IAccountSessionLock` usage
- **Concurrent outcomes (pinned by race tests, 50x barrier):** 2x refresh same token -> exactly 1 x 200, other 401 | refresh + logout same token -> logout always 204, 0 active tokens in family afterwards | login + login at cap -> active never > 5 | switch + refresh same token -> exactly 1 rotation | reset-password + refresh -> no active token survives
- **Scope limit:** lock is process-local (single instance); multi-instance needs DB concurrency token (deferred with EF)

## 7. Unit of Work, persistence & domain events

### 7.1 Commit & dispatch sequence

> `Infrastructure/Persistence/UnitOfWork/UnitOfWork.cs`
> `Infrastructure/Messaging/DomainEventsDispatching/{DomainEventsDispatcher,IDomainEventsProvider}.cs`
> `Application/Abstractions/Persistence/IPendingDomainEvents.cs`

1. Handler mutates aggregates through mock repos (immediate, in-process) & raises events on them
2. `TransactionBehavior` success path -> `UnitOfWork.CommitAsync` -> `DomainEventsDispatcher.DispatchEventsAsync`
3. **Dispatch loop:** `IDomainEventsProvider.DrainDomainEvents()` (atomic take + clear, oldest first by `OccurredOn`) -> `Publish` each event sequentially -> repeat until drain is empty (handlers may raise new events); max `DomainEventsDispatcher.MaxPasses` = 5, then leftovers are discarded, error logged & `InvalidOperationException` thrown (request -> 500 `InternalError`)
4. `SaveChangesAsync` (no-op)

- **Failure path:** handler exception OR failed `Result` -> `TransactionBehavior` skips commit, `IPendingDomainEvents.Discard()` drops pending events & logs warning (request name, event types); dispatch failure mid-loop discards remaining drained events (never re-queued), logs error, request -> 500
- `IPendingDomainEvents` exists because `TransactionBehavior` (Application) cannot see Infrastructure-local `IDomainEventsProvider`; both are implemented by `MockDataStore`

### 7.2 Event semantics & concurrency
- **Scan:** drain covers ALL aggregate sets: `Accounts, Users, UserRelations, UserBlocks, Posts, Likes, Comments, SavedItems, Notifications`
- **Removed aggregates:** hard-removing mock repos (`MockLikeRepository`, `MockUserBlockRepository`, `MockNotificationRepository`) call `MockDataStore.CaptureRemovedEvents` before `TryRemove`, moving pending events to `RemovedAggregateEvents` (drained with the rest) -> `LikeRemovedEvent` & `UserUnblockedEvent` are no longer lost; queue is cleared by `ResetForTests()`
- **Handler-raised events:** re-collected by next dispatch pass within same request (no leak into later unrelated request)
- **Ordering:** events published by `OccurredOn` per pass
- **Atomicity:** snapshot + clear is 1 critical section (lock), double publish is impossible
- **Failure semantics:** in-memory mutations are NOT rolled back; events of failed request are discarded, so side effects of already-mutated state (counters, notifications, saved-item cleanup) are skipped. Validators run before handlers & uniqueness checks run before creation to keep common failures side-effect free
- **CONCURRENCY & NON-PRODUCTION STATEMENT:** event provider is PROCESS-GLOBAL (static dictionaries), not per request scope. Lock only makes snapshot + clear atomic:
  - a drain can take events raised by CONCURRENT request (published in wrong request context)
  - discard-on-failure can drop events another request just raised
  - shared aggregates (counters, `Account`) are mutated without per-entity concurrency control except account session lock (§6.4)
  - this architecture is NOT production-ready; real fix = per-scope change tracking (EF `DbContext` tracker) + DB transactions + concurrency tokens (deferred migration)

### 7.3 Persistence reality
- State = static `ConcurrentDictionary` fields on `MockDataStore` (9 sets) + outbox `Messages` list; seed = deterministic & Development-only (`MockSeedOptions`, `Infrastructure/Data/Seed/{MockSeeder,SeedIds}.cs`): 3 accounts, 4 profiles (1 account has 2), 2 posts, fixed ids & timestamps (`SeedIds.BaseTime`); credentials are in `SeedIds` (NOT reproduced here); seed bcrypt work factor 4 (mock data only)
- **Restart** re-seeds identical ids; user data is lost
- **`ResetForTests()`:** `Clear()` IN PLACE every static collection then reseed; NEVER reassign (singleton repos & `MockNotificationOutboxStore` hold references to collections); also clears `RemovedAggregateEvents`
- Soft vs hard `Remove`: soft-delete is performed by domain method; mock `Remove` just re-stores entity for Account, Comment, Post, SavedItem, UserRelation, User; **hard** removal for Like, Notification, UserBlock
- No unique constraints (follow, like...) beyond application checks; queries are full scans (set-based repo members keep fixed number of calls per page, conventions/backend.md)
- `appsettings`/connection string/migrations: not yet; `AppContext.SetSwitch("Npgsql.EnableLegacyTimestampBehavior", true)` irrelevant until real DB exists

### 7.4 Notifications pipeline
- **Create:** handlers (`CreateNotificationWhenLiked`, `...CommentCreated`, `...FollowRequested`, `...FollowAccepted`) call `NotificationPublisher.PublishAsync`: self notifications are SKIPPED (no row, no outbox message), otherwise `Notification` is stored & `NotificationEnvelope(RecipientId, NotificationDto)` is enqueued
- **Push:** `ProcessNotificationOutboxJob` runs 1 `NotificationOutboxProcessor.ProcessBatchAsync` per second (20 messages, oldest first): `ReceiveNotification` with `NotificationDto` to `Clients.User(recipientId)` (hub user id = claim `user_id`); delivered messages are REMOVED from in-memory list; failures stay with `Attempts++` & are dropped after `MaxAttempts` (5) with error log
- **Types:** `NewLike`, `NewComment`, `NewFollow` (plain follow of public user, notifies followed user), `FollowRequested`, `FollowAccepted` (accepted request, notifies REQUESTER); `kind` = like | reply | follow for FE grouping
- **`NotificationDto.targetId`:** ROOT post id for like/comment (FE route `/posts/{id}`; comment like resolves comment's post), follower id for follow types; `senderUsername` + `senderName`; no preview text (deferred)
- **HTTP:** `GET /api/notifications` (newest first, `unreadCount`), `GET .../unread-count`, `PUT .../{id}/read` (403 `NotNotificationRecipient`, 404 unknown), `PUT .../read-all`; `AccessibleNotifications` drops notifications of blocked/deleted senders BEFORE counting & paging (list, `totalCount`, `unreadCount`, count endpoint share it)
- **Domain:** `Notification.Create` enforces `CannotSendNotificationToYourselfRule` (handlers pre-check, so dispatch never throws); `TargetId` replaced untyped `MetaData`
- **Limits:** in-memory, lost on restart; push reaches only active profile connection; retrying failed push has no backoff

## 8. Cross-cutting API behavior
- **Routing:** `api/[controller]` + `LowercaseUrls`; Users/UserRelations/UserBlocks override routes (`api/users/{targetId}/relations`, `api/users/{targetId}/blocks`); like/bookmark idempotent routes use absolute templates (`/api/posts/{id}/like`...) declared in `LikesController`/`SavedItemsController`
- **JSON:** System.Text.Json camelCase; `EnumerationJsonConverterFactory` -> every `Enumeration<T>` field is **integer** (strings rejected -> 400); read DTOs use string unions; strongly-typed IDs via generated `SystemTextJson` converter; contract details (omitted vs `null` fields): MAP §1
- **CORS:** policy built from `Cors:AllowedOrigins` + `AllowCredentials`; empty list = no origin allowed; dev origin in `appsettings.Development.json` (T1.7; permissive `SetIsOriginAllowed` removed)
- **HTTPS:** `UseHttpsRedirection` active; `launchSettings.json` https `49895` (matches FE)
- **Cancellation:** every controller action forwards request `CancellationToken` to `Mediator.Send`; mock repos ignore tokens anyway
- **Pagination (D16):** offset envelope `PagedResponse`, counts after access filter; defaults, limits & beyond-last behavior: MAP §1
- **Rate limiting, health checks, request size limits, structured logging:** not found

## 9. Implementation boundaries (what exists vs not)
- **Use-case-less domain behavior (no handler/endpoint):** `Post.UpdateSettings`, `Account.Deactivate/Activate/AssignRole`, `Account.ChangePassword` (only via reset)
- **Not found (no code):** search, hashtags/mentions, trending, reposts, pin, hide-like-count, media upload, DMs, session list, username change, create-profile, close-friends audience, profile tabs `replies`/`media`
- **Planned (comments/dead code only):** EF Core + PostgreSQL (`YSocialDbContext`, outbox `jsonb` config, commented queries), cache/search-index hooks, push-notification service

## 10. Known limitations & technical debt (single live register)

> Owner of BE debt, accepted risks & deferred work; other docs point here. Resolved items 1-8, 10, 11, 13-16, 18-20 (error mapping, event dispatch, auth lifecycle, read/write access gates, security hardening, pagination, notifications, feed, mute, share link): history in plan T1-T4 & §12 probes

### 10.1 Open / accepted (architectural)

| # | Item | Status |
|---|---|---|
| 9 | In-memory only; process-global event handling, no rollback or transactions | OPEN, ACCEPTED for FE integration (§7.2); fix = EF migration |
| 22 | Access token valid after logout until expiry (15 min), no revocation list | ACCEPTED (D6) |
| 23 | Session lock is process-local (multi-instance unsafe); new token-mutating paths MUST take it (§6.4) | ACCEPTED |
| 24 | `likesCount` stored aggregate, not viewer-filtered; stored `FollowersCount`/`FollowingCount` unexposed, remove at EF migration | ACCEPTED |
| 12 | `Task.WhenAll` over same repo: fixed in 3 handlers; `ValidationBehavior` keeps parallel validators (no repo access); no new occurrences allowed | RESOLVED (guard) |

### 10.2 Deferred (minor / waits on others)

| # | Item | Waits on |
|---|---|---|
| 17 | `likes/toggle` & `saveditems/toggle` kept next to idempotent routes | FE CP2 adoption, then remove |
| 21 | Notification push: failed processing retried (max 5) without backoff; no reply preview text | minor |
| 25 | `Post.UpdateSettings` & audience `CloseFriends` (D17): needs author -> viewer edge policy query | design |
| 26 | Account lifecycle: `Deactivate/Activate/AssignRole/ChangePassword`, create-profile, username change, session list | design (re-activation, session identity, username reuse) |
| 27 | Features without BE: search, tags, trending, suggestions, pin, hide-like-count, reposts, polls, drafts, DMs, report, media upload & multi-image, profile tabs `replies`/`media`, feed ranking | product decisions (§9, MAP §4) |

- **Remaining blockers for real deployment are architectural, not hardening:** persistence (EF + transactions + concurrency tokens), per-scope event tracking, multi-instance session lock, access-token revocation (items 9, §6.1, §6.4)

## 11. Tests
- 3 projects, 519 tests, all passing: `Domain.UnitTests` 60, `Application.UnitTests` 41, `Api.IntegrationTests` 418
- Layers, harness, reset rules & per-area coverage: `.context/features/backend-unit-test.md`
- Acceptance of every contract in this guide = integration tests over real HTTP pipeline (Swagger is NOT source of truth)

## 12. Evidence ledger

> Probes of T0.2 describe BEFORE-recovery behavior (characterization on original code). "Now" = current behavior, pinned by named test

| Claim / probe | Status | Observed before recovery (T0.2) | Now | Pinned by |
|---|---|---|---|---|
| Domain exceptions return 500 | Verified | non-author `PUT /api/posts/{id}` = 500 `text/plain` (rule class text) | 403 `NotPostAuthor` ProblemDetails | `NonAuthorEditPost_Returns403` |
| Follow response content type | Verified | `text/plain` `Accepted` without `Accept`; `application/json` `"Accepted"` with `Accept: application/json` | JSON `{followStatus:"accepted"\|"pending"}` | `Follow_ReturnsJsonFollowStatusLowercase` |
| Register response shape | Verified | raw JSON GUID string (accountId), 200 | 201 `{accountId}` | `Register_Returns201_AccountId` |
| Create post response | Verified | 200 `{postId, authorId, content, imageUrl, createdAt}` | 201 `PostDto` + `Location` | `CreatePost_201_PostDtoKindPost_Location` |
| `sub` claim readable as `AccountId` | Verified | switch with bogus token reached rule = 500 `RefreshTokenMustBeActiveRule` (not NotFound) | 401 `InvalidRefreshToken` | `SwitchProfile_OtherAccountsRefreshToken_Returns401` |
| Logout | Verified | 404 "Account not found" (profile id used as account id) | 204 | `Logout_ActiveToken_Returns204_TokenRevoked` |
| Login failures | Verified | wrong password 500, unknown account 400 | identical 401 `InvalidCredentials` | `Login_UnknownWrongPasswordDeleted_IdenticalBody401` |
| Text-only post | Verified | 500 (FluentValidation `ValidationException`) | 201 | `CreatePost_TextOnly_Returns2xx` |
| Event loss (follow, unlike) | Verified (runtime) | counts frozen; unlike lost | counts & notifications live | `FollowPublicUser_IncrementsCounts`, `Unlike_DecrementsPostLikeCount` |
| `appsettings` values, ports | Verified | unverified | `launchSettings` https `49895`; `Cors:AllowedOrigins` from config | `Cors_AllowedOrigin_GetsHeaders`, `Cors_UnknownOrigin_NoAllowOrigin` |
| Behavior order | Partially verified | log line order from 1 command | unchanged; registration order in `Application/DependencyInjection.cs` | - |
| Log redaction & Production startup | Verified | passwords/OTP/tokens printed by pipeline logger (code inspection) | `***`; Production without key fails, with key: no swagger, no seed, no dev token log | `Login_PipelineLogs_NoPasswordOrTokens`, `Production_MissingJwtSecret_FailsStartup`, manual `dotnet run` in Production |
| Manual login -> refresh -> logout smoke | Verified | not performed | login 200, refresh rotates, old token 401, logout 204, refresh after logout 401 (real host, Development) | manual `dotnet run` (2026-10-15) |
| JSON camelCase & enum ints | Verified | `POST /api/likes/toggle` shape | unchanged; read DTOs use string unions | `Swagger_*`, `ToggleEndpoints_Unchanged` |

- Test class locations: `tests/YSocial.Api.IntegrationTests/{Characterization,Errors,Identities,Status,Events,Config}`

## 13. Deviations from existing docs
- `features/identities.md` & `features/user-profile-and-relations.md`: endpoint content replaced by pointers to MAP (single owner); design decisions kept
- `conventions/backend.md`: aligned with recovery (no `Task.WhenAll` guidance for new code; mock `FirstOrDefault` scans instead of `AnyAsync`; EF planned only)
