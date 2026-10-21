---
module: Backend Implementation
stack: ASP.NET Core 8 / MediatR 14 / FluentValidation 12 / EF Core 9 + Npgsql (PostgreSQL)
updated: 2026-10-20
---

# BACKEND GUIDE

## 0. Scope
- **Paths:** repo-relative (`src/...`, `tests/...`); BE root = repo root (`YSocial.sln`). Shared kernel = sibling repo `Microservice.BuildingBlocks` (own snapshot; paths cited as `BB:Domain/...`, `BB:CQRS/...` under its `src/Microservice.BuildingBlocks.*`)
- **Companions:** domain detail in `domain-model.md` | FE contract (endpoints, error codes, DTOs) in `../integration/frontend-backend-mapping.md` | recovery plan & decisions D1-D20 in `../plans/2026-10-15-backend-recovery-&-fe-integration.md`
- **Generic conventions** (strongly-typed IDs, `IBusinessRule`, `IClassifiedRule`, `Result`, projectors, access gates) in `.context/conventions/backend.md`
- **Architecture:** Clean Architecture & DDD
- **State:** BE recovery implemented (T0-T4: auth, reads, graph, mute, feed, notifications, security hardening); persistence = EF Core + PostgreSQL (§7, MAP D25); NOT production-ready: process-local session lock & outbox poller, in-memory feed paging (§10)

## 1. Solution & project map

| Project | Refs | Role | Key packages |
|---|---|---|---|
| `src/YSocial.Api` | Application, Infrastructure | controllers, `Program.cs`, error pipeline, JSON/Swagger plumbing | JwtBearer 8.0.26, Swashbuckle 6.6.2, EF Core Design 9.0.4 |
| `src/YSocial.Application` | BuildingBlocks.CQRS, Domain | commands, queries, behaviors, projectors, access policy, event handlers | MediatR 14.1.0, FluentValidation 12.1.1 |
| `src/YSocial.Domain` | BuildingBlocks.Domain | aggregates, rules, events, repo contracts, error catalog | StronglyTypedId 0.2.1, CommunityToolkit.Common 8.4.0 |
| `src/YSocial.Infrastructure` | Application | `YSocialDbContext`, configurations, repos, migrations, seeds, JWT, UoW, outbox, SignalR, session lock | BCrypt.Net-Next 4.2.0, Npgsql.EntityFrameworkCore.PostgreSQL 9.0.4, System.IdentityModel.Tokens.Jwt 8.18.0 |
| `tests/YSocial.Domain.UnitTests` | Domain | xUnit 2.7.1, NSubstitute 5.3.0, FluentAssertions 8.3.0 | see §11 |
| `tests/YSocial.Application.UnitTests` | Application, Domain, Infrastructure, TestSupport | same stack | see §11 |
| `tests/YSocial.Api.IntegrationTests` | Api, Domain, TestSupport | same stack + `Microsoft.AspNetCore.Mvc.Testing` 8.0.26 | see §11 |
| `tests/YSocial.TestSupport` | Infrastructure, Domain | `SqliteTestDatabase` (throw-away SQLite file with prod model) & `Store` facade | Microsoft.EntityFrameworkCore.Sqlite 9.0.4 |

- All projects target `net8.0`; Api `Nullable` enabled; `InternalsVisibleTo` for test projects on Domain, Application, Infrastructure
- **Tools:** `.config/dotnet-tools.json` pins `dotnet-ef` 9.0.4 (`dotnet tool restore`)
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
| `TransactionBehavior` | opens no explicit transaction: commits only successful commands (`UnitOfWork.CommitAsync` = dispatch events, then 1 `SaveChanges` = 1 DB transaction); failed `Result`/exception -> nothing saved, pending events discarded (§7.1) | `Application/CQRS/Behaviors/UnitOfWork/TransactionBehavior.cs` |
| `YSocialDbContext` | also per-request change tracker & domain event source (`IDataStorage`, `IDomainEventsProvider`, `IPendingDomainEvents` all resolve to it) | `Infrastructure/Persistence/YSocialDbContext.cs` |
| `repo.Update(x)` | no-op for tracked entities (changes are already tracked); attaches detached ones | `Infrastructure/Persistence/Repositories/RepositoryBase.cs` |
| `repo.Remove(x)` | soft-deletable aggregates: no-op (domain method flagged row); Like, UserBlock, Notification: hard delete | `RepositoryBase.cs` |
| `IAccountRepository.GetByRefreshTokenAsync`, `GetAccountWithProfilesByIdentifierAsync` | advisory UNTRACKED snapshots (never mutate; re-load by id under session lock) | `Persistence/Repositories/AccountRepository.cs` |
| `InitializePostStatsHandler` | logs only (runs, does nothing else) | `Application/Features/Posts/CreatePost/EventHandlers/` |
| `ErrorType.Business` | maps to HTTP 400 `BusinessRuleViolated`, not domain exception | `Api/Controllers/ApiController.cs` |
| `IUserContext.UserId` | profile id (JWT `user_id`), NEVER account id; `GetViewerId()` = null for anonymous | §6.2 |

## 3. Request lifecycle

```
HTTP -> UseExceptionHandler (GlobalExceptionHandler) -> UseStatusCodePages -> [Development: Swagger] -> UseHttpsRedirection
     -> UseCors("YSocialCorsPolicy") -> UseAuthentication -> UseAuthorization
     -> MapControllers -> [Authorize]? -> model binding ([ApiController]; invalid -> ProblemDetails `ValidationFailed`)
     -> controller: Mediator.Send(request [, ct])
     -> ValidationBehavior -> LoggingBehavior -> MetricsBehavior -> TransactionBehavior (commands only) -> handler
        (TransactionBehavior: next() ok -> UnitOfWork.CommitAsync -> dispatch loop -> SaveChanges (1 DB transaction);
         exception | failed Result -> discard pending events, NO commit, nothing saved)
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
- **Mock sender logs:** email/SMS mock senders log no body outside Development; in Development digit runs of 4+ are masked unless `Messaging:LogOtpInDevelopment=true` (Development-only opt-in, default false, ignored elsewhere; set in local gitignored `appsettings.Development.json` with `Cors:AllowedOrigins`; `ApiFactory` forces it off so redaction tests stay valid)
- **Metrics:** only stopwatch log line
- **Rollback:** every request has its own `YSocialDbContext` (scoped): failed request saves nothing, so handlers may mutate freely before failing; state that MUST outlive failure (OTP attempt counter) is committed explicitly before throwing (`ResetPasswordCommandHandler`)
- **Notification (event) pipeline:** domain events published with `mediator.Publish` sequentially per event; open-generic behaviors do not wrap notifications (`IPipelineBehavior` is request-only; MediatR convention)
- **Decorators:** none
- **Nested dispatch:** see §7

## 4. DI registration

> `Infrastructure/DependencyInjection.cs`
> `Application/DependencyInjection.cs`

| Lifetime | Registrations |
|---|---|
| Singleton | `JwtSettings` (instance from `Program.cs`), `IJwtProvider`, `IPasswordHasher`, `IAccountSessionLock` (`AccountSessionLock`), `IUserIdProvider`, `TimeProvider` (`TimeProvider.System`, replaced by tests that need a clock) |
| Scoped | `YSocialDbContext` (also as `IDataStorage` / `IDomainEventsProvider` / `IPendingDomainEvents`), all 9 repos (`PostRepository`...), `IUserContext`, `IEmailSender`/`ISmsSender` (mocks), `INotificationOutboxService`, `IDomainEventsDispatcher`, `IUnitOfWork`, `IViewerAccessPolicy`, `UserProfileProjector`, `PostProjector`, `InteractionGuard`, `AccessibleFollowRequests`, `NotificationPublisher`, `AccessibleNotifications`, `NotificationOutboxProcessor`, validators (FluentValidation default) |
| Transient | domain services `LikeToggleService`, `CommentPostingService`, `SavedItemToggleService`, `UserProfileService`, `UserRelationManager`; MediatR handlers (default) |
| Hosted | `ProcessNotificationOutboxJob` (runs 1 `NotificationOutboxProcessor` batch every 1s; removed by test host) |

- **Assembly scanning:** `AddValidatorsFromAssembly(Application, includeInternalTypes: true)`; MediatR `RegisterServicesFromAssembly(Application)`; handlers, projectors & `InteractionGuard` are `internal sealed`
- **Overrides:** none in production; tests replace database registration by SQLite (`SqliteTestDatabase.ReplaceDatabaseOf`)
- **Config reads:** `Jwt:SecretKey|Issuer|Audience|AccessTokenMinutes` read ONCE by `JwtSettings.FromConfiguration` in `Program.cs` (singleton; key >= 32 chars REQUIRED outside Development, startup fails otherwise; Development falls back to constant `JwtSettings.DevelopmentSecretKey`; `AccessTokenMinutes` default 15), `Cors:AllowedOrigins` (array; `appsettings.json` empty, `appsettings.Development.json` = FE dev origin), `App:FrontendUrl`, `ConnectionStrings:DefaultConnection` (read lazily at first context use; Npgsql key=value OR `postgres://` URI, normalized by `ConnectionStrings.Normalize`; Development value lives in user-secrets, NEVER in files), `Database:AutoMigrate` (default = Development), `Database:SeedData` (Development ONLY, default true)
- **Hub:** `MapHub<NotificationHub>("/hubs/notifications")`
- **Startup:** `Program.cs` runs `DatabaseInitializer` (migrate, then seed core + development dataset, both idempotent) BEFORE pipeline is built; Production never seeds & migrates only when `Database:AutoMigrate=true`

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
- **Claims:** `sub` = AccountId | `user_id` = UserId (profile) | `email` | `jti` | `sid` = id of refresh token issued with the access token (login, refresh, switch; D30); no role claim, no profile username
- **Lifetime:** access token 15 min (`Jwt:AccessTokenMinutes`); refresh token 7 days (`Account.DefaultRefreshTokenExpiryDays`)
- **No revocation check:** issued access tokens stay valid after logout/rotation/account delete/password change until expiry (D6, accepted; <= 15 min window); no per-request account or user lookup
- **SignalR:** token accepted from query `access_token` only for paths starting `/hubs`
- **Dev only:** `Program.cs` logs admin JWT & sample posts, injects token into Swagger UI (`/swagger-custom.js`) & seeds mock data (`MockSeedOptions.Enabled = IsDevelopment()`) ONLY under Development; value not recorded here
- **Secret:** no fallback outside Development (`JwtSettings`, §4; shipped dev key & old hard-coded key are rejected there); `Production_MissingJwtSecret_FailsStartup` pins it; `appsettings.Development.json` is git-ignored, so Development key lives in code

### 6.2 `IUserContext` (`Infrastructure/Identity/UserContext.cs`)
- `UserId` <- claim `user_id`; `AccountId` <- claim `sub`; `SessionId` <- claim `sid` (`Guid.Empty` when missing: no `isCurrent`); `Email`; `IsAuthenticated`
- Missing/invalid claim -> `Guid.Empty` (no throw)
- **Viewer identity for reads:** `UserContextExtensions.GetViewerId()` = `UserId?` (null = anonymous); NEVER `AccountId`

### 6.3 Where authorization is enforced

| Surface | `[Authorize]` | Handler `IsAuthenticated` check |
|---|---|---|
| `IdentitiesController` | `DELETE account`, `GET sessions`, `DELETE sessions/{id}` | register, login, refresh-token, logout, forgot/reset: anonymous by design |
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
- **Login:** `LoginCommand(LoginId, Password, DeviceId, UserAgent?)` (`UserAgent` from `User-Agent` header, controller-set); `LoginId` = email | phone | username (heuristics: contains `@` -> email; leading `+` or digits/space/dash -> phone; else username); profile used for token = profile whose username equals `LoginId`, else default profile (`UserProfileService.ResolveProfile`)
  - **Order (D3):** account lookup -> password verify (unknown account runs 1 dummy bcrypt verify) -> only then `EnsureCanLogin` (`403 AccountInactive`) -> profile resolve -> token
  - **Failures:** unknown account, deleted account & wrong password -> identical `401 InvalidCredentials`; inactive account + wrong password -> 401 (state revealed ONLY to credential holder)
  - Response `LoginResponse(AccessToken, RefreshToken, RefreshTokenExpiry)`; **no user id/profile in body** -> FE decodes `user_id` from JWT (or calls `GET /api/users/me`)
- **Refresh tokens:** opaque GUID strings stored as child rows of `Account` (`RefreshTokens` table, cascade); each token bound to profile (`RefreshToken.UserId`) & linked to its successor (`ReplacedByTokenId`, token family)
  - **Cap (D4):** max `Account.MaxActiveSessions` = 5 active; 6th login evicts (revokes) oldest active token, no error (`DeviceSessionLimitRule` removed)
  - **Purge:** expired/revoked tokens dropped on next login, EXCEPT rotated tokens whose family still has active member (so logout of old token still finds it)
- **Refresh (D5):** `POST /api/identities/refresh-token {refreshToken}` anonymous -> 200 `LoginResponse`; token must exist, be active (not expired/revoked/rotated), account active & not deleted, bound profile exists & not deleted -> rotate (old revoked, `ReplacedByTokenId` set) else `401 InvalidRefreshToken`; stays bound to same profile
- **Logout:** `POST /api/identities/logout {refreshToken}` anonymous; ALWAYS 204 for active, unknown, revoked, expired or rotated tokens (empty body -> 400 `ValidationFailed`); rotated token -> its active descendants are revoked too (logout ends session it names); issued access tokens stay valid until expiry
- **Sessions (D30):** session = token family; `Account.GetSessions()` = 1 per active head, newest `LastTokenIssuedAt` first (ties: root `CreatedAt`, head id); `CreatedAt` of token is set once, so root = sign-in, head = last token issue (login/refresh/switch, NOT activity); `RevokeSession(id)` resolves ANY family member id, false = id not in account (404), true also for ended family; `BelongsToSession` backs `isCurrent`; revoke ends refresh only, issued access token valid until expiry (§6.1); `GET /api/identities/sessions`, `DELETE /api/identities/sessions/{id}` ([Authorize])
- **Switch profile:** `PUT /api/users/profiles/switch {profileId, refreshToken}` ([Authorize]): foreign, deleted or unknown profile -> 403 `ProfileNotOwned` (no id probing); token of another account / inactive -> 401 `InvalidRefreshToken`; rotation binds successor to target profile
- **Password reset:** `forgot-password` always 204, also for unknown ids; OTP 6 digits, bcrypt-hashed, 15 min, max 5 attempts; delivery = `MockEmailSender`/`MockSmsSender` (log only, includes OTP; OPEN debt T4.3); wrong/missing OTP -> 400 `InvalidOtp`, attempts exhausted -> 400 `OtpAttemptsExceeded`; unknown loginId on reset -> 400 `BusinessRuleViolated`; reset revokes all refresh tokens
- **Register:** `RegisterAccountCommand(Email, Password, Username, PhoneNumber?)` -> 201 `{accountId}`, no tokens; validator = FORMAT only (username `^[a-z0-9._]{3,30}$`, email, password >= 6 -> 400); handler = uniqueness BEFORE account creation (`409 EmailTaken`, `409 UsernameTaken`; case-insensitive; deleted accounts/profiles keep their email/username reserved) -> no orphan account; username flows via `AccountCreatedEvent` to first (default) profile
- **Delete account:** soft-delete + revoke all refresh tokens + event soft-deletes all profiles; existing access tokens remain usable (§6.1); posts/relations/comments remain but are hidden (profile deleted -> D20)

#### Session lock (D4-D6, plan §4.3)
- **Mechanism:** `IAccountSessionLock` (Application abstraction; `AccountSessionLock` singleton = `ConcurrentDictionary<AccountId, SemaphoreSlim(1,1)>`); NO other lock touches `Account` refresh tokens
- **Covered paths (ALL refresh-token list mutations):**

| Path | Handler | Notes |
|---|---|---|
| login | `LoginCommandHandler` | untracked password check, lock, load account, cleanup, eviction, add token, commit |
| forgot password | `ForgotPasswordCommandHandler` | untracked id lookup, lock, load, add reset token, commit (reset token bumps `Account.Version`, so it races with every other path otherwise) |
| refresh | `RefreshTokenCommandHandler` | token-keyed: untracked lookup, lock, load, re-validate, commit |
| logout | `LogoutUserCommandHandler` | token-keyed, same pattern |
| switch profile | `SwitchProfileCommandHandler` | lock first (id from JWT), then load, rotate, commit |
| reset password | `ResetPasswordCommandHandler` | untracked id lookup, lock, load; wrong OTP commits attempt counter before throwing |
| delete account | `DeleteAccountCommandHandler` | lock first, load, `Delete`, commit (profiles soft-deleted by event in same save) |
| revoke session | `RevokeSessionCommandHandler` | lock first (id from JWT), load, `RevokeSession`, commit INSIDE lock; conflict NOT caught: 409 `Conflict` (client retries) |

- **Rule for new code (MUST):** (1) lookups BEFORE lock are untracked (tracked pre-lock load would pin stale tokens in identity map), (2) take lock, THEN load `Account` by id, (3) `unitOfWork.CommitAsync` INSIDE lock (release happens when handler returns, i.e. BEFORE `TransactionBehavior` commits: next request would read old state); review = grep `RefreshToken` mutators vs `IAccountSessionLock` usage
- **Optimistic concurrency (multi-instance safety net):** `Account` has shadow int concurrency token `Version`, bumped by `YSocialDbContext.SaveChanges` whenever account, refresh token or reset token changes; concurrent writer fails with `DbUpdateConcurrencyException` -> `UnitOfWork` throws `ConcurrencyConflictException`; on 1 instance session lock makes this unreachable
- **Conflict outcome per endpoint (frozen MAP statuses hold):** refresh & switch -> 401 `InvalidRefreshToken`, logout & forgot-password -> 204 (handlers catch exception around their in-lock commit); login, reset password, delete account, revoke session (& any unlocked path) -> 409 `Conflict` via `GlobalExceptionHandler` (client retries). Pinned by `SessionConflictTests`
- **Concurrent outcomes (pinned by race tests, 50x barrier, SQLite; refresh race also verified on real PostgreSQL):** 2x refresh same token -> exactly 1 x 200, other 401 | refresh + logout same token -> logout always 204, 0 active tokens in family afterwards | login + login at cap -> active never > 5 | switch + refresh same token -> exactly 1 rotation | reset-password + refresh -> no active token survives
- **Scope limit:** lock is process-local; across instances `Version` token turns races into outcomes above instead of corruption (winner is not guaranteed to be "first" caller)

## 7. Unit of Work, persistence & domain events

### 7.1 Commit & dispatch sequence

> `Infrastructure/Persistence/UnitOfWork/UnitOfWork.cs`
> `Infrastructure/Persistence/YSocialDbContext.cs`
> `Infrastructure/Messaging/DomainEventsDispatching/{DomainEventsDispatcher,IDomainEventsProvider}.cs`
> `Application/Abstractions/Persistence/{IPendingDomainEvents,ConcurrencyConflictException}.cs`

1. Handler loads aggregates through repos (TRACKED by request's `YSocialDbContext`), mutates them & aggregates raise events
2. `TransactionBehavior` success path -> `UnitOfWork.CommitAsync` -> `DomainEventsDispatcher.DispatchEventsAsync`
3. **Dispatch loop:** `DrainDomainEvents()` (events of every tracked aggregate in ANY state, hard-removed ones included; clears them; oldest first by `OccurredOn`) -> `Publish` each event sequentially -> repeat until drain is empty (handlers may change data & raise new events); max `DomainEventsDispatcher.MaxPasses` = 5, then leftovers are discarded, error logged & `InvalidOperationException` thrown (request -> 500 `InternalError`)
4. `SaveChangesAsync` = 1 DB transaction for handler changes + event-handler changes + outbox rows; `DbUpdateConcurrencyException` -> `ConcurrencyConflictException` -> 409 `Conflict`

- **Failure path:** handler exception OR failed `Result` -> `TransactionBehavior` skips commit, `IPendingDomainEvents.Discard()` drops pending events & logs warning (request name, event types); context is never saved, so nothing of request persists; dispatch failure mid-loop discards remaining drained events, logs error, request -> 500
- `IPendingDomainEvents` exists because `TransactionBehavior` (Application) cannot see Infrastructure-local `IDomainEventsProvider`; both resolve to `YSocialDbContext`

### 7.2 Event semantics & concurrency
- **Scope:** events live on aggregates tracked by request's own context: no cross-request leak, no cross-request drain (old process-global store removed)
- **Atomicity:** all-or-nothing per request (1 `SaveChanges`); explicit extra commits exist only inside session-lock handlers (§6.4) & wrong-OTP attempt persistence
- **Handler-raised events:** re-collected by next dispatch pass within same request
- **Lost updates (ACCEPTED, §10):** stored counters (`LikeCount`, `SavedCount`, follower/following) are read-modify-write without concurrency token; only `Account` has `Version`
- **Duplicates:** unique indexes reject double like, double follow edge, double block, duplicate email/username/token (race surfaces as 500 `DbUpdateException`; sequential duplicates are handled idempotently by handlers)

### 7.3 Persistence
- **Provider:** PostgreSQL (Npgsql) in app; tests run SAME model on SQLite: keep LINQ provider-neutral (`ToLower()` compares, no `ILike`/provider functions); `jsonb` for outbox content is set only when `Database.IsNpgsql()`; split queries (`AutoInclude` of 2 child collections on `Account`)
- **Model (`YSocialDbContext`):** per-aggregate `IEntityTypeConfiguration` in `Persistence/Configurations` (+ outbox config next to its class); conventions in context: every key client-generated (`ValueGeneratedNever`), strongly-typed ids & `Enumeration` types (int; `Country` = ISO code) detected by shape/base type (new id or enumeration needs NO mapping code), `DateTime` = `timestamptz` UTC (`DateOfBirth` = `date`, no shifting), `DomainEvents` ignored
- **Mapping:** `User.ProfileInfo` & `PrivacySettings` = owned value objects (inline columns); `PasswordHash` = converted string; `Account` owns `RefreshTokens` & `PasswordResetTokens` (cascade, `AutoInclude`, backing fields)
- **Integrity:** NO cross-aggregate foreign keys (ids only, DM §2); only Account -> its tokens. Unique: `Account.Email`, `User.Username` (registered lowercase), `RefreshToken.Token`, `Like(user,type,target)`, `UserRelation(observer,target)`, `UserBlock(observer,target)`; indexes for reads by author, post, parent, recipient, target
- **Soft vs hard delete:** soft (flag set by domain method, row stays): Account, User, Post, Comment, SavedItem, UserRelation; hard (`Remove`): Like, Notification, UserBlock, delivered outbox rows, dropped tokens
- **Queries:** set-based repo members (DM §7) translate to SQL; paging, ordering & policy filtering stay in memory (DEBT §10)
- **Migrations:** `Infrastructure/Persistence/Migrations` (Npgsql SQL only); `ModelTests.Model_MatchesLatestMigrationSnapshot` fails when model changed without migration
- **Seeds (`Persistence/Seeding`):** `CoreSeeder` = deterministic test baseline (3 accounts, 4 profiles, 2 posts, ids in `SeedIds`); `DevelopmentSeeder` = rich demo dataset (12 accounts / 13 profiles, 2 private, ~48 posts with images, threaded comments, likes, saves, follow graph with pending requests & close friends, 2 blocks, mutes, notifications; every stored counter matches rows); both idempotent, written directly without events, passwords NOT repeated here (see `SeedIds`); bcrypt work factor 4
- **Discovery seed stage (`DiscoverySeeder`, D31/D32):** runs after the base stage on fresh AND already-seeded DBs, own sentinel `Account(100)`: removes the old stage 1 stock image URLs (seed ids + exact patterns only), adds 18 profiles (3 private), 72 tagged posts over 12 days, likes & a follow graph with mutuals; counters match rows; seeds no longer carry stock images (avatar/cover/post image null)
- **Restart:** state & sessions survive restarts (refresh tokens are rows)
- **Real DB verification:** Development run against hosted PostgreSQL: migrate + seed, login, feed, refresh rotation, concurrent refresh x6 -> exactly 1 x 200

### 7.4 Database operations
```
dotnet tool restore
dotnet user-secrets set "ConnectionStrings:DefaultConnection" "<npgsql string or postgres:// URI>" --project src/YSocial.Api
dotnet dotnet-ef migrations add <Name> -p src/YSocial.Infrastructure -s src/YSocial.Api -o Persistence/Migrations
dotnet dotnet-ef database update -p src/YSocial.Infrastructure -s src/YSocial.Api
dotnet dotnet-ef database update 0 -p src/YSocial.Infrastructure -s src/YSocial.Api
```
- **Run API in Development:** migrates & seeds automatically (`Database:AutoMigrate`, `Database:SeedData`)
- **Design-time connection:** `migrations add` needs none (`YSocialDbContextFactory` placeholder); `database update` reads env `YSOCIAL_DESIGN_CONNECTION` (never put real string in files)
- **Reset dev data:** `database update 0` drops every table, next API start re-creates & re-seeds
- **Tests never touch PostgreSQL:** host & unit tests use `SqliteTestDatabase`; guard `Host_UsesTheSqliteTestDatabase_NeverPostgres`

### 7.5 Notifications pipeline
- **Create:** handlers (`CreateNotificationWhenLiked`, `...CommentCreated`, `...FollowRequested`, `...FollowAccepted`) call `NotificationPublisher.PublishAsync`: self notifications are SKIPPED (no row, no outbox message), otherwise `Notification` row is stored & `NotificationEnvelope(RecipientId, NotificationDto)` is added as outbox row in SAME save (transactional outbox)
- **Push:** `ProcessNotificationOutboxJob` runs 1 `NotificationOutboxProcessor.ProcessBatchAsync` per second (20 rows, oldest first, own scope & context): `ReceiveNotification` with `NotificationDto` to `Clients.User(recipientId)` (hub user id = claim `user_id`); delivered rows are DELETED; failures stay with `Attempts++` & are deleted after `MaxAttempts` (5) with error log
- **Types:** `NewLike`, `NewComment`, `NewFollow` (plain follow of public user, notifies followed user), `FollowRequested`, `FollowAccepted` (accepted request, notifies REQUESTER); `kind` = like | reply | follow for FE grouping (`NotificationKind` in Domain is single mapping: DTO `kind`, list filter, preferences)
- **Preferences (D27):** `NotificationPublisher` loads recipient & skips (no row, no outbox) when `User.NotificationPreferences.Allows(type)` is false or recipient missing/deleted; stored as owned VO columns `NotifyLikes|NotifyReplies|NotifyFollows` (migration default `true`); `GET/PUT /api/notifications/preferences` (PUT: all 3 `bool?` required, else 400)
- **`NotificationDto.targetId`:** ROOT post id for like/comment (FE route `/posts/{id}`; comment like resolves comment's post), follower id for follow types; `senderUsername` + `senderName`; no preview text (deferred)
- **HTTP:** `GET /api/notifications?kind=like|reply|follow` (newest first, `unreadCount` overall, kind applied after access filter & before count/paging, D26), `GET .../unread-count`, `PUT .../{id}/read` (403 `NotNotificationRecipient`, 404 unknown), `PUT .../read-all?upToId` (bound = that notification's `CreatedAt`, ties included; 404/403 like single read; lookup skips access filter, D28); `AccessibleNotifications` drops notifications of blocked/deleted senders BEFORE counting & paging (list, `totalCount`, `unreadCount`, count endpoint share it)
- **Domain:** `Notification.Create` enforces `CannotSendNotificationToYourselfRule` (handlers pre-check, so dispatch never throws); `TargetId` replaced untyped `MetaData`
- **Limits:** push reaches only active profile connection; retrying failed push has no backoff; poller is single-instance (2 instances could push row twice, §10)

## 8. Cross-cutting API behavior
- **Routing:** `api/[controller]` + `LowercaseUrls`; Users/UserRelations/UserBlocks override routes (`api/users/{targetId}/relations`, `api/users/{targetId}/blocks`); like/bookmark idempotent routes use absolute templates (`/api/posts/{id}/like`...) declared in `LikesController`/`SavedItemsController`
- **JSON:** System.Text.Json camelCase; `EnumerationJsonConverterFactory` -> every `Enumeration<T>` field is **integer** (strings rejected -> 400); read DTOs use string unions; strongly-typed IDs via generated `SystemTextJson` converter; contract details (omitted vs `null` fields): MAP §1
- **CORS:** policy built from `Cors:AllowedOrigins` + `AllowCredentials`; empty list = no origin allowed; dev origin in `appsettings.Development.json` (T1.7; permissive `SetIsOriginAllowed` removed)
- **HTTPS:** `UseHttpsRedirection` active; `launchSettings.json` https `49895` (matches FE)
- **Cancellation:** every controller action forwards request `CancellationToken` to `Mediator.Send` & on to EF queries
- **Pagination (D16):** offset envelope `PagedResponse`, counts after access filter; defaults, limits & beyond-last behavior: MAP §1
- **Rate limiting, health checks, request size limits, structured logging:** not found

## 9. Implementation boundaries (what exists vs not)
- **Use-case-less domain behavior (no handler/endpoint):** `Post.UpdateSettings`, `Account.Deactivate/Activate/AssignRole`, `Account.ChangePassword` (only via reset)
- **Not found (no code):** search, mentions, reposts, pin, hide-like-count, media upload, DMs, username change, create-profile, close-friends audience, profile tabs `replies`/`media`
- **Planned (comments/dead code only):** cache/search-index hooks, push-notification service

## 10. Known limitations & technical debt (single live register)

> Owner of BE debt, accepted risks & deferred work; other docs point here. Resolved items 1-20 (error mapping, event dispatch, auth lifecycle, read/write access gates, security hardening, pagination, notifications, feed, mute, share link) & #9 (in-memory store, process-global events, no transactions: EF Core + PostgreSQL): history in plan T1-T4 & §12 probes

### 10.1 Open / accepted (architectural)

| # | Item | Status |
|---|---|---|
| 22 | Access token valid after logout until expiry (15 min), no revocation list | ACCEPTED (D6) |
| 23 | Session lock is process-local; across instances only `Account.Version` (409 on race); new token-mutating paths MUST follow §6.4 rules | ACCEPTED |
| 24 | `likesCount` stored aggregate, not viewer-filtered; stored `FollowersCount`/`FollowingCount` maintained by events but unexposed (removal candidate) | ACCEPTED |
| 28 | Feed, user posts & lists load candidates (`PostRepository.GetAllAsync`...), then filter by access policy, order & page IN MEMORY: cost grows with data | DEBT: push policy + paging into SQL (keyset) |
| 29 | Stored counters (likes, saves, followers) are read-modify-write without concurrency token (lost update under concurrent writers); duplicate like/follow race = unique-index violation = 500 | ACCEPTED (map to 409 when it shows up) |
| 30 | Outbox poller is single-instance (no row lock / `SKIP LOCKED`): >1 instance may push row twice | ACCEPTED |

| 31 | Discovery (D31, D32) loads window rows (`GetWithHashtagsSinceAsync`, 365 days max), every active profile & accepted edge (suggestions) and aggregates IN MEMORY; hashtag rows load only through explicit includes | DEBT: SQL group-by, cached suggestions |
| 32 | Posts created before D31 have no tag rows until edited (no backfill job, no production data) | ACCEPTED |

### 10.2 Deferred (minor / waits on others)

| # | Item | Waits on |
|---|---|---|
| 21 | Notification push: failed processing retried (max 5) without backoff; no reply preview text | minor |
| 25 | `Post.UpdateSettings` & audience `CloseFriends` (D17): needs author -> viewer edge policy query | design |
| 26 | Account lifecycle: `Deactivate/Activate/AssignRole/ChangePassword`, create-profile, username change (session list done, D30) | design (re-activation, username reuse) |
| 28 | Token families grow without bound while a session stays active (~96 rotations/day, ancestors kept by `RemoveExpiredTokens`); `GetSessions`/`FindRoot`/`BelongsToSession` scan the list per hop (quadratic). Fix: dictionaries per call + prune ancestors older than access lifetime (carry family sign-in time forward) | OPEN (found in settings review) |
| 27 | Features without BE: search, mentions, pin, hide-like-count, reposts, polls, drafts, DMs, report, media upload & multi-image, profile tabs `replies`/`media`, feed ranking | product decisions (§9, MAP §4) |

- **Remaining blockers for real deployment:** multi-instance session lock & outbox (items 23, 30), SQL-side paging (28), access-token revocation (22), counter concurrency tokens (29)

## 11. Tests
- 3 test projects + `TestSupport`, 734 tests run, all passing (+3 PostgreSQL opt-in tests, skipped unless `YSOCIAL_TEST_POSTGRES` holds a disposable server's admin connection string): `Domain.UnitTests` 130, `Application.UnitTests` 81 (incl. persistence: repos, hashtag rows, model snapshot guard, seeders incl. discovery stage, connection strings, outbox; session conflict outcomes), `Api.IntegrationTests` 523 (incl. `Discovery/`: trending, tag posts, suggestions)
- Layers, harness, reset rules & per-area coverage: `.context/backend/architecture/backend-unit-test.md`
- Acceptance of every contract in this guide = integration tests over real HTTP pipeline (Swagger is NOT source of truth); data layer runs on SQLite there, real PostgreSQL is verified manually (§7.3)

## 12. Evidence ledger

> Probes of T0.2 describe BEFORE-recovery behavior (characterization on original code). "Now" = current behavior, pinned by named test. All are verified

| Claim / probe | Observed before recovery (T0.2) | Now | Pinned by |
|---|---|---|---|
| Domain exceptions return 500 | non-author `PUT /api/posts/{id}` = 500 `text/plain` (rule class text) | 403 `NotPostAuthor` ProblemDetails | `NonAuthorEditPost_Returns403` |
| Follow response content type | `text/plain` `Accepted` without `Accept`; `application/json` `"Accepted"` with `Accept: application/json` | JSON `{followStatus:"accepted"\|"pending"}` | `Follow_ReturnsJsonFollowStatusLowercase` |
| Register response shape | raw JSON GUID string (accountId), 200 | 201 `{accountId}` | `Register_Returns201_AccountId` |
| Create post response | 200 `{postId, authorId, content, imageUrl, createdAt}` | 201 `PostDto` + `Location` | `CreatePost_201_PostDtoKindPost_Location` |
| `sub` claim readable as `AccountId` | switch with bogus token reached rule = 500 `RefreshTokenMustBeActiveRule` (not NotFound) | 401 `InvalidRefreshToken` | `SwitchProfile_OtherAccountsRefreshToken_Returns401` |
| Logout | 404 "Account not found" (profile id used as account id) | 204 | `Logout_ActiveToken_Returns204_TokenRevoked` |
| Login failures | wrong password 500, unknown account 400 | identical 401 `InvalidCredentials` | `Login_UnknownWrongPasswordDeleted_IdenticalBody401` |
| Text-only post | 500 (FluentValidation `ValidationException`) | 201 | `CreatePost_TextOnly_Returns2xx` |
| Event loss (follow, unlike) | counts frozen; unlike lost | counts & notifications live | `FollowPublicUser_IncrementsCounts`, `Unlike_DecrementsPostLikeCount` |
| `appsettings` values, ports | unverified | `launchSettings` https `49895`; `Cors:AllowedOrigins` from config | `Cors_AllowedOrigin_GetsHeaders`, `Cors_UnknownOrigin_NoAllowOrigin` |
| Log redaction & Production startup | passwords/OTP/tokens printed by pipeline logger | `***`; Production without key fails, with key: no swagger, no seed, no dev token log | `Login_PipelineLogs_NoPasswordOrTokens`, `Production_MissingJwtSecret_FailsStartup`, manual `dotnet run` in Production |
| Manual login -> refresh -> logout smoke | not performed | login 200, refresh rotates, old token 401, logout 204, refresh after logout 401 (real host, Development) | manual `dotnet run` |
| EF Core on real PostgreSQL | in-memory only | migrate + seed + login (email, phone, username any case) + feed + thread with replies + create post + like + forgot/reset (wrong OTP 400 `InvalidOtp`) + follow requests + blocks + mutes + saved + notifications OK; concurrent refresh x6 on 1 token -> exactly 1 x 200 (hosted PostgreSQL) | manual `dotnet run` (Development) |

- Test class locations: `tests/YSocial.Api.IntegrationTests/{Characterization,Errors,Identities,Status,Events,Config}`

## 13. Deviations from existing docs
- `features/identities.md` & `features/user-profile-and-relations.md`: endpoint content replaced by pointers to MAP (single owner); design decisions kept
