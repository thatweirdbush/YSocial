---
module: Backend Decisions & Conventions
stack: C# / ASP.NET Core 8 / MediatR / FluentValidation / DDD (in-memory store; EF Core planned)
updated: 2026-10-15
---

# BACKEND DECISIONS & CONVENTIONS

## 1. Architectural Decisions
- **Soft delete over hard delete:** unfollow sets `IsDeleted = true` to preserve metadata (e.g. `IsCloseFriend`). Re-follow restores existing record -> prevents unique index conflicts
- **Aggregate segregation:** `UserBlock` = standalone Aggregate Root (separate from `UserRelation`) for fast block checks (mock = scans today; `AnyAsync` once EF lands)
- **Idempotent commands (fail silently):** re-trigger (e.g. follow already-followed user, PUT like twice) -> return Success immediately, no mutation
- **Query batching:** minimize round-trips with SET-BASED repo members (id collections in, rows out) & bidirectional queries (e.g. `GetBlocksBetweenAsync`, `GetBlockedEitherWayAsync`). NEVER add `Task.WhenAll` over the same repo/`DbContext` in new code (breaks on a single EF `DbContext`, BG §10.12)
- **Single gate per direction:** reads go through `IViewerAccessPolicy`, writes through `InteractionGuard` (§3); handlers never re-implement block/privacy/visibility checks

## 2. Conventions
1. **Imports:** NEVER full namespace in code lines; MUST write `using` at file top
2. **Enumerations:** prefer `Enumeration` from `Microservice.BuildingBlocks.Domain.Enumerations` over standard `enum` (exception: infrastructure-facing `RuleViolationKind`, `ErrorType`)
   - Pattern: `public sealed record FollowStatus(int Value, string Name) : Enumeration<FollowStatus>`
3. **Business Rules:** `internal sealed record ... : IClassifiedRule` (`Code` & `Kind` constants, then `Message` -> `BrokenWhen`, separated by blank line); see §3
4. **Domain rule checks:** when `IBusinessRule` validated outside `AggregateRoot` at Domain layer -> use `Entity.CheckRule()`
5. **FluentValidation:**
   - Single rule & single option: inline (e.g. `RuleFor(x => x.PostId).NotEmpty();`)
   - Multiple rules/options: multi-line, 1 line per option
   - Validators check FORMAT only; uniqueness/existence belongs to the handler (`Result.Conflict`/`NotFound`)
6. **StronglyTypedId:** ALWAYS enforce strongly-typed IDs for domain entities:
   ```csharp
   namespace YSocial.Domain.UserRelations;

   [StronglyTypedId(jsonConverter: StronglyTypedIdJsonConverter.SystemTextJson)]
   public partial struct UserRelationId;
   ```
7. **Async:** async all the way; parallelize only independent work on DIFFERENT repos/services, never the same repo (see §1)
8. **User context:** ALWAYS use `IUserContext` in command handlers when accessing current user info; viewer identity for reads = `userContext.GetViewerId()` (`UserId?`, profile id from `user_id`, NEVER `AccountId`, null = anonymous)
9. Comments, `<summary>` docs, property/class/method names: short, English
10. Line endings: CRLF
11. File-scoped namespaces (`namespace X;`)
12. Use `#region` to group members in large classes: Properties, ICommand, command handlers, events, constants...
13. Remove & sort usings at end of every task
14. Prefer `record` for simple classes with primitive types
15. **Vertical slices:** `Application/Features/<Area>/<UseCase>/<UseCase>.cs` (command/query + validator + handler in 1 file), handlers `internal sealed`; commands return `Result`/`Result<T>`; aggregate rule failures stay exceptions (mapped to HTTP by `GlobalExceptionHandler`)

## 3. Generic patterns

### 3.1 Classified rules & error codes (D1, D2)
- **`IClassifiedRule : IBusinessRule`** (`Domain/Common/Rules/`): `string Code` (a constant of `Domain/Common/Errors/ErrorCodes.cs`) & `RuleViolationKind Kind` (`Invalid` 400, `Forbidden` 403, `NotFound` 404, `Conflict` 409, `Unauthorized` 401); both MUST be constants (read without constructing the rule)
- **Guards:** reflection tests `AllRules_AreClassified`, `AllRuleCodes_ExistInCatalog` & `CodesSnapshot_MatchesApprovedList`; new rule = new/used catalog code + snapshot & MAP §1.1 update
- **Kind `NotFound`** hides entities (blocked, deleted): generic detail, never name the entity
- **Result codes:** `Result.Fail/NotFound/Conflict/Validation/Unauthorized/Forbidden(message, code?)`; omit `code` for the per-`ErrorType` default (`ValidationFailed`, `BusinessRuleViolated`, `Unauthenticated`, `Forbidden`, `NotFound`, `Conflict`); pass an explicit catalog code for specific cases (`EmailTaken`, `InvalidCredentials`...)
- **No class-name derived codes**; renaming a rule class never changes the contract

### 3.2 Read side
- **`IViewerAccessPolicy`** (`Application/Features/Access/`): THE single definition of discoverability (not blocked either way, not deleted), content visibility (owner | public | accepted follower) & post/comment accessibility; load ONE `ViewerAccessContext` per request (`GetContextAsync(viewerId, candidateIds)`, 1 call to each of users/blocks/relations) and use its predicates & `Filter*` helpers
- **Order (MUST):** filter by the policy FIRST, then count, then page; `totalCount`, `hasNextPage`, `commentsCount`, `followersCount`, `requestCount` use the SAME filter as their lists; apply to EVERY returned entity incl. nested ones (`user`, thread `parent`/`replies`)
- **Projectors** (batch, fixed number of repo calls per page, no N+1): `UserProfileProjector` (profiles, counts computed on read, relation flags, `markAsBlocked` only for the own block list), `PostProjector` (posts + comments -> `PostDto`, viewer like/save flags via `GetLikedTargetIdsAsync`/`GetSavedTargetIdsAsync`, direct-children counts); inaccessible items are DROPPED (callers treat an empty projection as 404)
- **Locked vs 404:** private & not permitted = 200 `locked: true` (empty items, `totalCount` 0); blocked/deleted/unknown/hidden = 404; never mix

### 3.3 Write side
- **`InteractionGuard`** (`Application/Features/Access/`): like/bookmark (set & toggle) require the target and its root post to be accessible to the actor, else `NotFound` (404); comment creation uses the projector for the post & parent; block target existence is checked in the handler
- Author-only actions keep ownership in domain rules (403); a hidden target answers 404 first where the handler applies the policy (`UpdatePost`, `AddComment`, and delete/restore of posts & comments via `InteractionGuard.IsPostHiddenFromAsync`/`IsCommentHiddenFromAsync`: outsiders get 404, participants reach the 403 rules)

### 3.4 Repo contracts
- **Set-based members** on Domain contracts (accept `IReadOnlyCollection<Id>`, return rows or `IReadOnlySet<...>`): e.g. `GetBlockedEitherWayAsync`, `GetRelationsAsync`, `GetAcceptedEdgesAsync`, `GetPendingRequestsAsync`, `GetByObserverAsync`, `GetLikedTargetIdsAsync`, `GetSavedTargetIdsAsync`, `GetByIdsAsync`, `GetTopLevelCommentsByPostIdsAsync`, `GetChildCommentsByParentIdsAsync`; list per contract in DM §7
- **Typed ids on parent queries:** post ids and comment ids are never mixed in one query (2 strongly-typed members)
- Unordered returns: callers filter by the policy, order & page in memory (EF migration pushes paging down later)

### 3.5 Lists & pagination
- **Pagination validators:** `PaginationRules.MustBeValidPage()` (>= 1) & `MustBeValidPageSize()` (1..50) on every list query; response `PagedResponse<T>` (`Slice` helper for an already-filtered list); page beyond last = 200 empty + real metadata
- **Relation search (`RelationSearch`):** shared rule for follow requests, followers/following (and future mutes): `query` trimmed, max 50 (`MustBeValidRelationQuery`), matches `username` OR `displayName` case- & diacritics-insensitive (FormD, `đ` mapped), applied AFTER the access filter and BEFORE paging

### 3.6 Concurrency & sessions
- Every `Account.RefreshTokens` mutation runs under `IAccountSessionLock` (per account; process-local); new token-mutating paths MUST acquire it (BG §6.4)
- Domain events: raised on aggregates, dispatched after the successful command (BG §7); events of hard-removed aggregates are captured by the mock repo (`MockDataStore.CaptureRemovedEvents`)

### 3.7 API surface
- `[Authorize]` per action on write endpoints; NEVER controller-level on controllers that also serve anonymous reads (`UsersController`)
- New JSON DTOs: records in `Application/Models`, string unions for enums (D9), `Guid` ids; request bodies keep `Enumeration` ints
- Every endpoint declares `[ProducesResponseType]` with the real DTO & `ProblemDetails` for errors; contract change = update MAP, regenerate the FE swagger copy, keep the `Swagger_*` tests green
