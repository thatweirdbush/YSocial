---
module: BE Recovery & FE Integration Plan
created: 2026-10-15
status: proposed (decisions pending approval, no task started)
inputs: ../architecture/backend-guide.md (BG) | ../architecture/domain-model.md (DM) | ../integration/frontend-backend-mapping.md (MAP) | ../../conventions/backend.md
---

# BE RECOVERY & FE INTEGRATION PLAN

> **For agentic workers:** execute 1 task per session with `superpowers:executing-plans` (or `subagent-driven-development`), TDD per `test-driven-development`, finish with `verification-before-completion`. Track progress with `- [ ]` -> `- [x]` on task headers (§5)

- **Goal:** make BE safe to integrate (correct errors, auth lifecycle, events) & expose min read/write contract that replaces FE mocks for auth, profile, posts, threads, saved & relationship controls
- **Architecture:** keep Clean Architecture + MediatR pipeline + FluentValidation + DDD rules + in-memory `MockDataStore`; add API-level error mapping, read-model projections in Application, viewer access policy as single read-side gate
- **Tech stack:** ASP.NET Core 8, MediatR 14, FluentValidation 12, xUnit + FluentAssertions + NSubstitute, `Microsoft.AspNetCore.Mvc.Testing` 8.x (new)
- **Target read shape:** FE domain types (`PostItem`, `UserProfile`, `PostThread`, `FollowListPage`, `RelationSets`) = DTO target; FE swaps ONLY service bodies (`post-detail.md` decision 1)

## 1. Goals & non-goals

### Goals
- Every domain/validation failure returns correct 4xx ProblemDetails, never 500
- Login, refresh, logout, profile switch work end-to-end matching FE `api-client.ts` refresh contract
- All domain events dispatch in same request (follow counts, block purge, unlike, follow notifications)
- MVP read endpoints for profile, post, user posts, saved, thread; viewer flags & counts; privacy/block enforced on reads
- API-level regression suite that pins each fix

### Non-goals
- Real DB / EF Core migration (keep `MockDataStore`; BG §7.3)
- Wiring FE services to BE, FE feature work
- Search, tags, trending, pin, hide-like-count, reposts, polls, drafts, DMs, media upload, multi-image (§8)
- Shared-kernel (`Microservice.BuildingBlocks`) changes; NOT needed by any task below
- Full re-audit; facts in BG/DM/MAP are assumed unless a task's first step contradicts them

## 2. Global constraints
- Conventions: `.context/conventions/backend.md` + global C# style (file-scoped namespaces, CRLF, `#region`, sort usings, records for simple DTOs)
- Features stay vertical slices: `Application/Features/<Area>/<UseCase>/<UseCase>.cs` (command/query + validator + handler in 1 file), handlers `internal sealed`
- New domain rules: `internal sealed record ...Rule : IBusinessRule` (`Message` then `BrokenWhen`)
- Commands return `Result`/`Result<T>`; business failures inside aggregates stay exceptions (mapped by T1.1), no rewrite of rules into `Result`
- Repo additions = new interface members on Domain contracts + mock impl; set-based (accept id collections) to stay EF-friendly; NO `Task.WhenAll` over same repo in new code (BG §10.12)
- Swagger is NOT source of truth; acceptance = integration tests over real HTTP pipeline
- JSON: camelCase; ids GUID strings; `Enumeration` ints stay for existing requests; new read DTOs expose FE string unions (D9)
- Do not change FE code; FE checkpoints (§6) are verification hand-offs only

## 3. New evidence (verified 2026-10-15, adds to BG/MAP)

| Fact | Impact | Source |
|---|---|---|
| `launchSettings.json` = `https://localhost:51607`; FE & `00-agentic-rules.md` = `49895` | FE cannot reach BE as-is | `src/YSocial.Api/Properties/launchSettings.json` |
| `BusinessRuleValidationException.BrokenRule` carries rule instance | rule -> status mapping possible in API, no shared-kernel change | `BB:Domain/BusinessRules/BusinessRuleValidationException.cs` |
| Rules are `internal sealed record` | API cannot match rule types directly -> public marker interfaces in Domain (D2) | `Domain/*/Rules/*.cs` |
| `RefreshToken` stores `AccountId` only, no `UserId` | refresh cannot know active profile -> must bind profile at issue/rotate (T1.5) | `Domain/Identities/RefreshToken.cs` |
| `MockUserBlockRepository.Remove` = `TryRemove` (hard) | `UserUnblockedEvent` lost same as unlike -> generic removed-aggregate fix (T1.3) | `Infrastructure/Data/MockUserBlockRepository.cs` |
| Seed ids = `New()` per process start | FE-held JWT/ids dangle after restart; tests can't reference seed | `MockDataStore.SeedMockData` |
| No `Program` partial; App/Infra types `internal` | `WebApplicationFactory` & handler tests need seams (T0.1) | `Program.cs` |
| `Post` has no comment counter | `commentsCount` computed by query (T2.3) | `Domain/Posts/Post.cs` |
| FE refresh call = `POST /api/identities/refresh-token {refreshToken}` -> reads `accessToken`, `refreshToken`; no auth header | fixes refresh route & shape (D5) | FE `src/lib/api-client.ts:121` |
| FE username pattern `^[a-z0-9._]{1,30}$` + min 3 | register validator target (T1.8) | FE `features/auth/utils/mock-session.ts:8`, `features/auth/types/index.ts:93` |
| FE `updatePostContent`/`updateProfile` consume RETURNED projection | update endpoints should return read DTO (D7) | FE `post-service.ts:378`, `profile.md` |
| FE `setPrivateAccount(false)` accepts all pending, returns `{ acceptedCount }` | privacy endpoint contract (T3.1) | FE `mocks/privacy.ts:15` |

## 4. Contract decisions (approval required)

Default = recommended; implement default unless user overrides. Owner task applies it

| # | Decision | Recommended default | Alternative / trade-off | Owner |
|---|---|---|---|---|
| D1 | Error envelope | RFC 7807 `ProblemDetails` everywhere (`type`, `title`, `status`, `detail`, `instance`, ext `code`, `traceId`); validation adds `errors: { field: string[] }` (camelCase keys); empty-body 401/403/404 also get ProblemDetails via `UseStatusCodePages` | keep current anonymous object: no `code`, FE needs 4 parsers | T1.1 |
| D2 | Rule -> status | default `BusinessRuleValidationException` -> 400; rules implementing new public marker `IForbiddenRule` -> 403 (`OnlyAuthor*`, `OnlyDeleter*`, `OnlyRecipient*`); `EntityNotFoundException` & missing target -> 404; `code` = rule type name minus `Rule` suffix (e.g. `CannotFollowYourself`) | 422 for business rules (cleaner HTTP semantics, but FE `handleResponse` & Swagger assume 400) | T1.1 |
| D3 | Login failure | unknown account & wrong password both -> 401 `code=InvalidCredentials` (no enumeration) | keep 400 vs 401 split: enables FE multi-step identity check but leaks accounts; FE identity step then validates format only | T1.4 |
| D4 | Session cap (5) | 6th login evicts oldest active token (no error) | reject with 409 `code=DeviceSessionLimit` (FE must offer "log out other devices") | T1.4 |
| D5 | Refresh | `POST /api/identities/refresh-token` anonymous, body `{refreshToken}` -> 200 `LoginResponse` + rotate (old revoked); reuse of revoked token -> 401; token bound to profile `UserId` | separate `/refresh` route (FE change) | T1.5 |
| D6 | Token lifetimes | access 15 min (`Jwt:AccessTokenMinutes`), refresh 7 days (unchanged); no per-request revocation check | keep 7-day access (logout cannot invalidate for a week) | T1.5 |
| D7 | Write responses | create -> 201 + read DTO (`PostDto`, reply `PostDto`); update post/profile -> 200 + read DTO; delete/restore/other no-payload -> 204 (`Result<bool>` -> `Result`); register -> 201 `{accountId}` | keep 200 `true`: FE refetches after each edit (extra round trip, races) | T1.9, T2.3, T2.2, T2.5 |
| D8 | Follow response | 200 JSON `{ "followStatus": "accepted" \| "pending" }` | raw PascalCase string (content-type ambiguity, MAP §1) | T1.9 |
| D9 | Status/enum fields in NEW read DTOs | lowercase strings matching FE unions (`followStatus`, `visibility`); request enums stay ints (existing converter) | ints everywhere: FE maps every enum | T2.2, T2.3 |
| D10 | Like/save semantics | add idempotent set endpoints `PUT`/`DELETE /api/likes` & `/api/saveditems` (body `{targetId,targetType}`), 204; keep toggle routes until FE wired, then remove | toggle only: FE optimistic retry flips state (MAP §4.8) | T1.10 |
| D11 | Username at register | required `username` in register (`^[a-z0-9._]{3,30}$`), case-insensitive unique (409 `code=UsernameTaken`); email uniqueness real check; not editable (MVP) | derive from email: FE register form field is dead, collisions on same local part | T1.8 |
| D12 | Replies model | keep `Comment` aggregate; project comments as `PostDto` with `kind: "post" \| "comment"` & `parentId`; parent comment MUST belong to same post; nesting unbounded (FE navigates deeper via thread) | migrate replies to `Post` with `ParentPostId` (big domain rewrite, loses comment rules) | T2.5 |
| D13 | Thread route | `GET /api/threads/{id}` resolves post OR comment id -> FE `PostThread` shape; deleted/hidden -> 404 | separate `/posts/{id}/thread` + `/comments/{id}/thread` (FE `/posts/[id]` can't tell which) | T2.5 |
| D14 | Blocked-by exposure | profile read returns 200 minimal projection with `isBlockedBy: true` (no bio/counts/posts); `RelationSets.blockedBy` exposed | return 404 (more private, like Instagram); FE "unavailable" state then = not-found | T2.2, T3.2 |
| D15 | Private profile | profile header + counts visible; posts/lists return `locked: true` & empty items for non-owner non-accepted viewer (FE `profile.md` precedence) | 403 on lists (FE expects `locked` flag) | T2.4, T3.2 |
| D16 | Pagination | offset `page` (1-based) & `pageSize` (default 10, max 50, relation lists default 20); envelope `{ items, page, pageSize, totalCount, hasNextPage }`; out-of-range -> 400 | cursor (better for live feeds; defer to feed task T4.1) | T1.2, T2.4 |
| D17 | Post audience/visibility on create | MVP accepts none (all Public); `closeFriends` audience deferred, BE enum not extended yet | add `CloseFriends` to `PostVisibility` now (enforcement needs close-friend lookup in policy) | §8 |
| D18 | Media | `imageUrl` optional single URL string; no upload endpoint | upload API + multi-image (separate plan) | T1.6 |
| D19 | Dev origin & seed | `launchSettings` -> `https://localhost:49895`; CORS origins from `Cors:AllowedOrigins` (dev = `http://localhost:3000`); seed ids deterministic (fixed GUIDs) | change FE base URL instead; random seed ids (FE breaks after each restart) | T0.1, T1.7 |
| D20 | Deleted profile content | posts/comments of soft-deleted profiles hidden from all reads | keep visible with "deleted user" author | T2.1 |

## 5. Phases, tasks & dependencies

### 5.1 Dependency graph

```
Phase 0 (sequential)      T0.1 harness ──> T0.2 characterization
                                  │
Phase 1 (foundation)      ┌───────┼───────────────┬────────────┬──────────┐
                          T1.1 errors          T1.3 events   T1.6 text   T1.7 dev cfg
                          │                       │          post         (no deps)
              ┌───────────┤                       │
              T1.2 query  T1.4 logout             │
              validation  │                       │
                          T1.5 refresh            │
                          │                       │
                          T1.8 username           │
                          │                       │
                          T1.9 status cleanup     │
                          │                       │
                          T1.10 like/save set <───┘ (counts need T1.3)
Phase 2 (read MVP)        T2.1 access policy (needs T1.3)
                          ├──> T2.2 profile reads (needs T1.8)
                          └──> T2.3 post projector (needs T1.6, T1.9)
                                 ├──> T2.4 paged lists (needs T1.2)
                                 └──> T2.5 thread + comment hardening
                          T2.6 contract snapshot (after T2.2..T2.5)
Phase 3 (graph)           T3.1 privacy + requests ──> T3.2 lists + relation sets
                          T3.3 write enforcement (needs T1.10, T2.5)   T3.4 mute (optional)
Phase 4 (optional)        T4.1 feed | T4.2 notifications | T4.3 security hardening
```

### 5.2 Task classification

| Class | Meaning | Tasks |
|---|---|---|
| Blocker | FE integration slice cannot start without it | T0.1, T0.2, T1.1-T1.9, T2.1-T2.5, T3.1 (private account FE), T3.2 (relation lists FE) |
| Blocker-for-quality | FE works without it, but would ship known-wrong behavior | T1.10 (toggle races), T3.3 (write leaks), T2.6 (typed contract) |
| Optional feature | FE slice stays on mocks until done | T3.4, T4.1, T4.2 |
| Debt cleanup | not FE-visible; REQUIRED before shared deployment | T4.3 |

### 5.3 Parallel lanes (separate sessions, no shared files)

| Lane | Tasks | Shared-file conflicts to avoid |
|---|---|---|
| A errors/API | T1.1 -> T1.2 -> T1.9 | `ApiController.cs`, all controllers |
| B events | T1.3 -> T2.1 | `MockDataStore.cs`, mock repos (T2.1 needs only T1.3; T1.10 joins lane A after T1.9) |
| C identity | T1.4 -> T1.5 -> T1.8 | `IdentitiesController`, `Account.cs`, `JwtProvider` |
| D small | T1.6, T1.7 | none |

- After T0.2: A (T1.1), B, D start in parallel; C starts after T1.1 (needs error contract for its assertions); T1.2 runs in lane A while C runs
- C is sequential: T1.4, T1.5, T1.8 all touch `IdentitiesController` & Identities models
- T1.9 touches `IdentitiesController` & register -> run after C finishes
- T1.10 touches Likes/Saved controllers -> run after T1.9
- Phase 2: T2.2 & T2.3 parallel (different features) after T2.1; T2.4 & T2.5 parallel after T2.3 (T2.4 = Posts/Saved, T2.5 = Comments/Threads)
- Phase 3: T3.1 -> T3.2 sequential (`UserRelationsController`, relation repo); T3.3 parallel with T3.1

### 5.4 Tasks

Each task = 1 session. "Tests" lists required tests (name -> assertion). Every task's DoD also includes: `dotnet build YSocial.sln` 0 errors & no new warnings, all test projects green, usings sorted, docs per §7 updated

---

#### - [ ] T0.1 Integration test harness & stable seed
- **Scope:** new `tests/YSocial.Api.IntegrationTests` (xUnit, FluentAssertions, `Microsoft.AspNetCore.Mvc.Testing` 8.x) referenced in `YSocial.sln`; `public partial class Program;` at end of `Program.cs`; `InternalsVisibleTo("YSocial.Api.IntegrationTests")` on Application & Infrastructure; `MockDataStore.ResetForTests()` (clear all dictionaries + outbox, reseed); deterministic seed GUIDs exposed as `SeedIds` constants (D19); test helpers `ApiFactory`, `AuthHelper.LoginAsync(loginId, password)` -> bearer client, `[Collection("Api")]` with parallelization disabled
- **Depends:** none
- **Files:** `tests/YSocial.Api.IntegrationTests/**`, `src/YSocial.Api/Program.cs`, `src/YSocial.Infrastructure/Data/MockDataStore.cs`, `*.csproj` (`InternalsVisibleTo`)
- **Notes:** seed ids set via Infrastructure-only seed helper (reflection on `Id` setter acceptable ONLY in seed code); factory env = `Development` to keep admin token path working, or `Testing` with seed still on (seed is unconditional today)
- **Tests:** `Smoke_GetSeedPost_Returns200` | `Reset_RestoresSeed_AfterMutation` (create post, reset, list -> seed count)
- **DoD:** suite runs twice in a row green; no test depends on order

#### - [ ] T0.2 Characterization & probe tests
- **Scope:** pin behavior that MUST survive; resolve BG §12 & MAP §8 probes; write target-behavior tests for known defects as `[Fact(Skip = "T1.x")]` so owner task un-skips them
- **Depends:** T0.1
- **Files:** `tests/YSocial.Api.IntegrationTests/Characterization/*.cs`
- **Tests (must pass now):** register -> login -> create post (with `imageUrl`) -> get post -> 200 | follow public user twice -> same status (idempotent) | unfollow absent edge -> 204 | block twice -> 204 | toggle like -> `{isLiked:true}` then `false` | saved toggle + `GET /api/saveditems/posts` lists post | update profile -> 200 | switch profile -> new token with other `user_id` | delete post -> 204/200 then `GET` 404 | restore by author
- **Probes (record result in BG §12, then delete probe or keep as test):** non-author `PUT /api/posts/{id}` status/body | follow response content type with & without `Accept: application/json` | GUID JSON shape of register & create-post | JWT claim `sub` -> `AccountId` readable
- **Skipped target tests:** one per defect in T1.1..T1.6 (names listed in those tasks)
- **DoD:** probes answered in BG §12 (status `Verified`); skipped tests compile

#### - [ ] T1.1 Error contract: exceptions & results -> ProblemDetails
- **Scope:** D1, D2. `AddProblemDetails` + `GlobalExceptionHandler : IExceptionHandler` + `UseExceptionHandler` + `UseStatusCodePages`; map `ValidationException` -> 400 + `errors`; `BusinessRuleValidationException` -> 400 / 403 (`IForbiddenRule`) with `code`; `EntityNotFoundException` -> 404; unknown -> 500 ProblemDetails, no stack outside Development; `ApiController.ProcessErrorResponse` emits same ProblemDetails (+ `code` when known); `InvalidModelStateResponseFactory` keeps `ValidationProblemDetails`; replace bare-string 400 in `LikesController`/`SavedItemsController`
- **Domain change:** add `public interface IForbiddenRule : IBusinessRule` (`src/YSocial.Domain/Common/Rules/`) & apply to ownership rules: `OnlyAuthorCanPerformActionOnPostRule`, `OnlyAuthorCanEditCommentRule`, `OnlyAuthorOrPostOwnerCanDeleteCommentRule`, `OnlyDeleterCanRestoreCommentRule`, `OnlyRecipientCanReadNotificationRule`
- **Depends:** T0.2
- **Files:** `src/YSocial.Api/Infrastructure/Errors/*` (new), `Program.cs`, `Controllers/ApiController.cs`, `LikesController.cs`, `SavedItemsController.cs`, 5 rule files + marker
- **Tests:** `NonAuthorEditPost_Returns403Problem` (`code=OnlyAuthorCanPerformActionOnPost`) | `CreatePost_ContentOver2000_Returns400WithErrors` | `FollowSelf_Returns400_CannotFollowYourself` | `FollowMissingUser_Returns404` | `RestoreNotDeletedPost_Returns400` | `InvalidOtp_Returns400` | `NullTargetType_Returns400Problem` | `Unauthenticated_Comment_Returns401Problem` | `NoToken_AuthorizeEndpoint_Returns401Problem` (status pages) | `UnhandledException_Returns500Problem_NoStack` (inject throwing handler via test service override)
- **DoD:** no request in §T0.2 skipped list returns 500 unless genuinely unexpected; every 4xx body has `status`, `title`, `detail`, `code` (when rule/known); Swagger NOT required to match yet (T2.6)

#### - [ ] T1.2 Query validation & pagination bounds
- **Scope:** D16. Relax `ValidationBehavior` constraint from `ICommand<TResponse>` to all requests (queries get validators; `TransactionBehavior` unchanged); fix existing query validators: `page >= 1`, `1 <= pageSize <= 50`; add shared `PaginationValidator` rules for new list queries; guard `PagedList.TotalPages` divide-by-0
- **Depends:** T1.1
- **Files:** `Application/CQRS/Behaviors/Validation/ValidationBehavior.cs`, `Features/Posts/GetPost*/`, `Models/Commons/PagedList.cs`, `Application/CQRS/Validation/` (new shared rules)
- **Tests:** `UserPosts_PageSize0_Returns400` | `UserPosts_PageSize51_Returns400` | `UserPosts_Page0_Returns400` | `GetPost_EmptyGuid_Returns400` | regression `UserPosts_Default_Returns10NewestFirst`
- **DoD:** queries never hit `TransactionBehavior` (assert via commit spy or log); validators run once per request

#### - [ ] T1.3 Domain-event dispatch reliability
- **Scope:** (a) `MockDataStore` provider scans ALL aggregate sets incl. `UserRelations`, `UserBlocks`, `Notifications`; (b) hard-removing mock repos (`Like`, `UserBlock`, `Notification`) move aggregate's pending events into `MockDataStore` removed-events queue before `TryRemove`, drained by provider; (c) atomic `DrainDomainEvents()` on `IDomainEventsProvider` (local interface `Infrastructure/Messaging/DomainEventsDispatching/IDomainEventsProvider.cs`, not shared kernel) (lock around snapshot + clear) replacing get+clear pair; (d) `DomainEventsDispatcher` loops drain -> publish until empty, max 5 passes, then logs error & throws `InvalidOperationException` (cycle guard)
- **Depends:** T0.2 (parallel with T1.1)
- **Files:** `Infrastructure/Data/MockDataStore.cs`, `MockLikeRepository.cs`, `MockUserBlockRepository.cs`, `MockNotificationRepository.cs`, `Infrastructure/Messaging/DomainEventsDispatching/*`
- **Tests:** `FollowPublicUser_IncrementsFollowerAndFollowingCount` (read via `MockDataStore` until T2.2) | `Unfollow_DecrementsCounts` | `Unlike_DecrementsPostLikeCount` | `UnlikeComment_DecrementsCommentLikeCount` | `Block_RemovesFollowsBothDirections_AndCountsInSameRequest` (multi-pass) | `Unblock_DispatchesUserUnblockedEvent` (no leftover events after request) | `FollowPublicUser_CreatesFollowAcceptedNotification` | `DeletePost_SoftRemovesSavedItems_InSameRequest` (nested event, previously next-request) | `Dispatcher_StopsAfterMaxPasses` (unit, fake provider)
- **DoD:** after any request, provider holds 0 pending events; DM §6 "Live?" column all `yes` for reachable events

#### - [ ] T1.4 Logout, session eviction, uniform login failure
- **Scope:** D3, D4. `IAccountRepository.GetByRefreshTokenAsync(token)`; logout = `[AllowAnonymous]`, body `{refreshToken}`, revokes token found on any account, idempotent 204 (unknown/revoked token -> 204); `Account.AddRefreshToken` evicts oldest active when cap reached (replace throwing rule usage, keep rule for invariant tests or delete rule + its test); login unknown account & wrong password -> `Result.Unauthorized` `code=InvalidCredentials` (catch password rule inside handler or verify before domain call)
- **Depends:** T1.1
- **Files:** `Features/Identities/LogoutUser/`, `Features/Identities/Login/`, `Domain/Identities/Account.cs`, `IAccountRepository.cs`, `Infrastructure/Data/MockAccountRepository.cs`, `IdentitiesController.cs`, `tests/YSocial.Domain.UnitTests/Identities/AccountTests.cs` (new)
- **Tests:** `Logout_RevokesRefreshToken_Returns204` | `Logout_Twice_Returns204` | `Logout_WithExpiredAccessToken_StillRevokes` | `SixthLogin_EvictsOldestSession` (domain unit + API) | `Login_UnknownAccount_Returns401InvalidCredentials` | `Login_WrongPassword_Returns401InvalidCredentials` (same body) | regression `ResetPassword_RevokesAllTokens`
- **DoD:** repeated login/logout loop (10x) never locks account

#### - [ ] T1.5 Refresh endpoint, profile-bound tokens, access lifetime
- **Scope:** D5, D6. `RefreshToken.UserId` (profile) set at login (resolved profile) & `SwitchProfile` (target profile); `Account.RotateRefreshToken` keeps/updates `UserId`; new `RefreshTokenCommand(refreshToken)` -> validates active token, loads account + bound profile (must exist, not deleted, belong to account), rotates, returns `LoginResponse`; reuse of rotated token -> 401 `code=InvalidRefreshToken`; `Jwt:AccessTokenMinutes` (default 15) in `JwtProvider`
- **Depends:** T1.4
- **Files:** `Domain/Identities/RefreshToken.cs`, `Account.cs`, `Features/Identities/RefreshToken/` (new), `Features/Users/SwitchProfile/`, `Features/Identities/Login/`, `Infrastructure/Identity/JwtProvider.cs`, `IdentitiesController.cs`, `appsettings.json`
- **Tests:** `Refresh_ValidToken_ReturnsNewPair_AndRevokesOld` | `Refresh_RotatedToken_Returns401` | `Refresh_AfterSwitchProfile_KeepsSwitchedUserId` | `Refresh_DeletedProfile_Returns401` | `Refresh_DeletedAccount_Returns401` | `AccessToken_ExpiresAfterConfiguredMinutes` (claim `exp`) | regression `SwitchProfile_RotatesToken`
- **DoD:** FE `api-client.ts` refresh flow contract satisfied (route, body, response fields)

#### - [ ] T1.6 Text-only post creation
- **Scope:** D18. Remove `ImageUrl` NotNull/NotEmpty; when present: absolute http(s) URL, max 2048; `Content` max 2000 in validator (mirror domain rule -> field-level `errors`)
- **Depends:** T0.2 (parallel); assertions on 400 need T1.1 merged first
- **Files:** `Features/Posts/CreatePost/CreatePost.cs`
- **Tests:** `CreatePost_TextOnly_Returns2xx` | `CreatePost_EmptyContent_Returns400` | `CreatePost_InvalidImageUrl_Returns400` | regression `CreatePost_WithImage_Returns2xx`
- **DoD:** FE `createPost` with `images: []` maps to valid request

#### - [ ] T1.7 Dev integration config
- **Scope:** D19. `launchSettings` https `49895`; CORS policy reads `Cors:AllowedOrigins` (dev `http://localhost:3000`), drop `SetIsOriginAllowed(_ => true)`; `appsettings.Development.json` with non-secret dev values
- **Depends:** none
- **Files:** `Properties/launchSettings.json`, `Program.cs` (CORS block only), `appsettings*.json`
- **Tests:** `Cors_AllowedOrigin_GetsHeaders` | `Cors_UnknownOrigin_NoAllowOrigin`
- **DoD:** `dotnet run` serves `https://localhost:49895/swagger`; FE origin preflight succeeds

#### - [ ] T1.8 Register username & uniqueness
- **Scope:** D11. `RegisterAccountCommand(Email, Password, Username, PhoneNumber?)`; validator pattern `^[a-z0-9._]{3,30}$`; `IUserRepository.IsUsernameTakenAsync` (case-insensitive, incl. soft-deleted? -> include deleted to avoid reuse confusion); real `IsEmailUniqueAsync`; username passed to profile init (event payload or handler creates profile directly - prefer event payload, keeps `AccountCreatedEvent` flow); validation happens BEFORE account creation -> orphan path closed
- **Depends:** T1.5 (lane C order; logically only T1.1)
- **Files:** `Features/Identities/RegisterAccount/`, `Features/Identities/EventHandlers/InitializeUserProfileHandler*`, `Domain/Identities/Events/AccountCreatedEvent.cs`, `Domain/Users/IUserRepository.cs`, mock user repo, `Api/Models/Identities/*`
- **Tests:** `Register_WithUsername_ProfileHasUsername` | `Register_DuplicateUsername_Returns409_UsernameTaken` (case-insensitive) | `Register_DuplicateEmail_Returns409` | `Register_InvalidUsername_Returns400` | `Register_Failure_LeavesNoOrphanAccount`
- **DoD:** BG §10.10 resolved

#### - [ ] T1.9 Status code & response-shape cleanup
- **Scope:** D7 (no-payload part), D8. `Result<bool>` commands -> `Result` (204): DeletePost, RestorePost, DeleteComment, RestoreComment, DeleteProfile, SetDefaultProfile, DeleteAccount (UpdatePost, UpdateComment, UpdateProfile NOT here: they move to read DTO in T2.3/T2.5/T2.2); register -> 201 `{accountId}`; follow -> `{ followStatus }` lowercase; add `ApiController.Created...` helper; per-action `[Authorize]` on `UsersController` WRITE actions only (update, switch, set-default, delete) -> 401 instead of 404/500; NEVER controller-level (T2.2 reads must stay anonymous for guest `/@username`)
- **Depends:** T1.1, T1.8 (register, shared `IdentitiesController`)
- **Files:** listed features, controllers, `ApiController.cs`
- **Tests:** one status test per changed endpoint | `Follow_ReturnsJsonFollowStatus_Lowercase` | `UpdateProfile_Anonymous_Returns401`
- **DoD:** no endpoint returns bare `true` or bare string

#### - [ ] T1.10 Idempotent like/save set endpoints
- **Scope:** D10. `SetLikeCommand(targetId, targetType, liked)` & `SetSavedItemCommand(..., saved)` reusing `LikeToggleService`/`SavedItemToggleService` internals (no-op when already in state); routes `PUT`/`DELETE /api/likes`, `PUT`/`DELETE /api/saveditems` -> 204; soft-deleted saved row reuse optional
- **Depends:** T1.3 (counts), T1.9 (controller files)
- **Files:** `Features/Likes/SetLike/` (new), `Features/SavedItems/SetSavedItem/` (new), `LikesController.cs`, `SavedItemsController.cs`
- **Tests:** `PutLike_Twice_LikeCountIs1` | `DeleteLike_WhenNotLiked_Returns204_CountUnchanged` | `PutSaved_Twice_SingleSavedRow` | regression toggle endpoints unchanged
- **DoD:** FE `setPostLike(id, liked)` & `setPostBookmark` map 1:1

#### - [ ] T2.1 Viewer access policy
- **Scope:** single Application service `IViewerAccessPolicy` (D14, D15, D20): `CanDiscoverUser(viewer?, target)` (false if block either way or target deleted), `CanViewProfileContent(viewer?, target)` (owner | public | accepted follower), `CanViewPost(viewer?, post, author)` (discoverable & content visible & `Visibility`: Public | FollowersOnly needs accepted | Private owner only); batch form `GetViewerContextAsync(viewer, candidateUserIds)` -> blocked-either-way set, accepted-followee set, relation map; anonymous viewer supported. Repo additions (set-based): `IUserBlockRepository.GetBlockedEitherWayAsync(userId, candidateIds)`, `IUserRelationRepository.GetRelationsAsync(observerId, targetIds)`
- **Depends:** T1.3
- **Files:** `Application/Features/Access/` (new), Domain repo contracts, mock repos, new `tests/YSocial.Application.UnitTests` (xUnit + NSubstitute, `InternalsVisibleTo`)
- **Tests (unit matrix):** owner sees own private | anonymous vs private -> locked | pending follower -> locked | accepted -> visible | block A->B & B->A -> undiscoverable both ways | deleted author -> hidden | FollowersOnly post vs non-follower -> hidden | dormant close-friend flag grants nothing
- **DoD:** policy mirrors FE `mocks/visibility.ts` rules (`relationship-controls.md` Key rules); single call per list (no per-item repo round trip)

#### - [ ] T2.2 Profile reads & `me`
- **Scope:** `GET /api/users/{id:guid}`, `GET /api/users/by-username/{username}`, `GET /api/users/me` -> `UserProfileDto` = FE `UserProfile` (`id, displayName, username, bio, avatarUrl, coverUrl, followersCount, followingCount, isVerified=false, isPrivate, isFollowing, followStatus, viewerMarkedCloseFriend, isMuted, isBlocked, isBlockedBy`); `me` adds `profiles: [{id, username, displayName, avatarUrl, isDefault}]` for switcher; blocked-by -> minimal projection (D14); `PUT /api/users/profiles/me` returns `UserProfileDto` (D7)
- **Depends:** T2.1, T1.8, T1.9
- **Files:** `Features/Users/GetUserProfile/` (new), `Features/Users/GetMe/` (new), `Application/Models/UserProfileDto.cs`, `UsersController.cs`
- **Tests:** `GetProfile_ById_ReturnsCountsAfterFollow` | `GetProfile_ByUsername_CaseInsensitive` | `GetProfile_Unknown_Returns404` | `GetProfile_Deleted_Returns404` | `GetProfile_ViewerFlags_Pending/Accepted/None` | `GetProfile_BlockedByTarget_ReturnsMinimal_IsBlockedByTrue` | `GetMe_Anonymous_Returns401` | `UpdateProfile_ReturnsProjection`
- **DoD:** FE `fetchUser`, `fetchUserByUsername`, `updateProfile`, `ensureViewerUser` have a 1:1 endpoint

#### - [ ] T2.3 Post read model & author enrichment
- **Scope:** `PostDto` = FE `PostItem` subset: `id, kind ("post"), content, imageUrl, createdAt, isEdited, likesCount, commentsCount, isLikedByCurrentUser, isBookmarkedByCurrentUser, user {id, displayName, username, avatarUrl, isVerified}, visibility ("public")`; `PostProjector` (Application, batch): authors by ids, viewer likes/saves by target ids, comment counts by post ids (non-deleted); repo additions `ILikeRepository.GetLikedTargetIdsAsync(userId, targetIds, type)`, `ISavedItemRepository.GetSavedTargetIdsAsync(...)`, `ICommentRepository.CountByPostIdsAsync(postIds)`; apply to `GET /api/posts/{id}` (policy -> 404 when hidden), `POST /api/posts` (201 `PostDto`), `PUT /api/posts/{id}` (200 `PostDto`); remove `PostInfo.AuthorName` placeholder
- **Depends:** T2.1, T1.6, T1.9
- **Files:** `Application/Models/PostDto.cs`, `Application/Features/Posts/Projection/` (new), `GetPost/`, `CreatePost/`, `UpdatePost/`, Domain repo contracts, mock repos, `PostsController.cs`
- **Tests:** `GetPost_HasAuthorSnapshot` | `GetPost_ViewerFlags_AfterLikeAndSave` | `GetPost_Anonymous_FlagsFalse` | `GetPost_CommentsCount_ExcludesDeleted` | `GetPost_PrivateAuthor_NonFollower_Returns404` | `GetPost_BlockedAuthor_Returns404` | `CreatePost_Returns201PostDto` | `UpdatePost_Returns200PostDto_IsEditedTrue`
- **DoD:** no endpoint returns `PostInfo`; projector issues fixed number of repo calls per page

#### - [ ] T2.4 Paged lists: user posts & saved posts
- **Scope:** D15, D16. Generic `PagedResponse<T>` (`items, page, pageSize, totalCount, hasNextPage`); `GET /api/posts/user/{userId}` -> `UserPostsPageDto` (`PagedResponse<PostDto>` + `locked`), policy filter BEFORE paging, root posts only (FE tab `threads`; `replies`/`media` tabs deferred §8); `GET /api/saveditems/posts?page&pageSize` paged, newest saved first, hidden/deleted posts skipped, `PostDto`
- **Depends:** T2.3, T1.2
- **Files:** `Application/Models/Commons/PagedResponse.cs`, `Features/Posts/GetPostsByUserId/`, `Features/SavedItems/GetSavedPosts/`, `ISavedItemRepository` (paged member)
- **Tests:** `UserPosts_LockedForNonFollower_EmptyItemsLockedTrue` | `UserPosts_Owner_SeesAll` | `UserPosts_BlockedEitherWay_LockedTrueEmptyItems` | `UserPosts_TotalCountAfterFilter` | `SavedPosts_Paged_NewestSavedFirst` | `SavedPosts_SkipsDeletedAndHidden`
- **DoD:** FE `fetchUserPosts(.., "threads", page)` & `fetchSavedPosts(page)` map 1:1 (`nextPage = hasNextPage ? page+1 : undefined`)

#### - [ ] T2.5 Thread read & comment write hardening
- **Scope:** D12, D13. `GET /api/threads/{id}` -> `{ post, parent?, replies, childReplies }` (FE `PostThread`): root = post or comment as `PostDto` (`kind`, `parentId`); replies = direct non-deleted children newest first; `childReplies` = 1 level of children per reply; comment projection reuses `PostProjector` (likes `targetType=2`, `commentsCount` = direct child count); `AddComment`: parent must belong to same post (`ParentCommentMustBelongToPostRule`) & not deleted; `POST /api/comments` -> 201 `PostDto`; `PUT /api/comments/{id}` -> 200 `PostDto`
- **Depends:** T2.3
- **Files:** `Features/Threads/GetThread/` (new), `Features/Comments/AddComment/`, `UpdateComment/`, `ICommentRepository` (`GetByPostIdAsync`, `GetChildrenAsync(parentIds)`), `Domain/Comments/Rules/` (new rule), `ThreadsController.cs` (new), `CommentsController.cs`
- **Tests:** `Thread_ByPostId_RepliesNewestFirst` | `Thread_ByCommentId_HasParent` | `Thread_ExcludesDeletedReplies` | `Thread_HiddenRootPost_Returns404` | `Thread_ReplyLikeFlag_UsesCommentTarget` | `AddComment_ParentFromOtherPost_Returns400` | `AddComment_Returns201PostDto`
- **DoD:** FE `fetchPostThread(id)` & `createReply` map 1:1; `/posts/[replyId]` resolvable

#### - [ ] T2.6 Contract snapshot
- **Scope:** `[ProducesResponseType]` with real DTOs + `ProblemDetails` on all touched endpoints; regenerate `ysocial-clients/web-app/docs/swagger.json` (copy only; FE `generated.ts` regen is FE task); 1 integration test asserting Swagger doc builds
- **Depends:** T2.2..T2.5
- **Files:** controllers, `Program.cs` (Swagger), FE `docs/swagger.json`
- **DoD:** MAP §2 tables updated to new statuses; Swagger response schemas non-empty for MVP endpoints

#### - [ ] T3.1 Privacy toggle & follow requests
- **Scope:** `PUT /api/users/profiles/me/privacy {isPrivate}` -> `{acceptedCount}` (going public accepts all pending via `AcceptFollow`, events fire); `GET /api/users/me/follow-requests?page&query` (`FollowListPage` of requesters); `GET /api/users/me/follow-requests/count`; `POST /api/users/{requesterId}/relations/follow-request` with `{decision: "accept"|"decline"}` -> 204 (decline = delete edge, no event); fix `FollowAccepted` notification recipient when accepting request (requester notified)
- **Depends:** T2.2, T1.3
- **Files:** `Features/Users/UpdatePrivacy/`, `Features/UserRelations/{GetFollowRequests,RespondFollowRequest}/`, `IUserRelationRepository` (pending by target, paged), `UserRelationsController.cs`, `UsersController.cs`
- **Tests:** `Follow_PrivateTarget_Pending` | `Accept_MakesAccepted_IncrementsCounts` | `Decline_RemovesEdge_NoCountChange` | `GoPublic_AcceptsAllPending_ReturnsCount` | `RespondMissingRequest_Returns404` | `Requests_RequireAuth`
- **DoD:** FE `setPrivateAccount`, `fetchFollowRequests`, `fetchFollowRequestCount`, `respondFollowRequest` map 1:1; `Pending` reachable via API

#### - [ ] T3.2 Followers/following lists & relation sets
- **Scope:** `GET /api/users/{id}/followers|following?page&query` (accepted only, `RELATION_PAGE_SIZE` 20, `UserProfileDto` items, locked per D15, excludes users undiscoverable to viewer); `GET /api/users/me/relation-sets` -> FE `RelationSets` (`blocked, blockedBy, muted, closeFriends` (all flags incl. dormant), `isPrivate, requestCount`); `GET /api/users/me/blocks?page`
- **Depends:** T3.1
- **Files:** `Features/UserRelations/{GetFollowList,GetRelationSets}/`, `Features/UserBlocks/GetBlocks/`, repo list members, controllers
- **Tests:** `Followers_ExcludesPendingAndBlocked` | `Followers_PrivateLocked` | `Following_QueryFilter_ByUsernameOrName` | `RelationSets_IncludesDormantCloseFriend` | `RelationSets_BlockedBy`
- **DoD:** FE `fetchFollowList`, `fetchRelationSets`, `fetchBlockedUsers`, `fetchCloseFriendCandidates` (accepted followings) covered

#### - [ ] T3.3 Interaction enforcement on writes
- **Scope:** like/save/comment/reply require target post viewable via `IViewerAccessPolicy` (else 404, no leak); comment blocked when block either way (`UserMustNotBeBlockedRule`); close-friend toggle on non-accepted edge -> 400 `code` (already rule-based after T1.1); block self -> 400
- **Depends:** T2.1, T1.10, T2.5
- **Files:** `Features/Likes/*`, `Features/SavedItems/*`, `Features/Comments/AddComment/`, `Domain/Comments/Services/CommentPostingService.cs`
- **Tests:** `Like_PrivatePostNonFollower_Returns404` | `Comment_BlockedEitherWay_Returns404` | `Save_BlockedAuthor_Returns404` | regression own-content like allowed
- **DoD:** MAP §4.7 risk closed for writes

#### - [ ] T3.4 Mute set endpoint (optional)
- **Scope:** `PUT`/`DELETE /api/users/{targetId}/relations/mute` (idempotent; edge-less mute creates edge? -> decide in task: recommend allow mute without follow by creating `None` edge only if domain supports, else require relation); `GET /api/users/me/mutes`
- **Depends:** T3.2
- **Files:** `Features/UserRelations/{SetMute,GetMutes}/` (new), `Domain/UserRelations/UserRelation.cs` (if mute without follow), `UserRelationsController.cs`
- **Tests:** `PutMute_Twice_Idempotent` | `DeleteMute_WhenNotMuted_Returns204` | `Mutes_List_Paged`
- **DoD:** FE `setMuted`, `fetchMutedUsers` map 1:1

#### - [ ] T4.1 Feed (optional, recommended next)
- **Scope:** `GET /api/feed?tab=following|forYou&page` (following = accepted followees + self root posts; forYou = all viewable root posts), policy + projector reuse; muted excluded; decide offset vs cursor here (D16 alt)
- **Depends:** T2.4, T3.4 (mute exclusion; skip exclusion if T3.4 deferred)
- **Files:** `Features/Feed/GetFeed/` (new), `IPostRepository` (by authors, paged), `FeedController.cs` (new)
- **Tests:** `Feed_Following_OnlyAcceptedFolloweesAndSelf` | `Feed_ForYou_ExcludesHiddenAndBlocked` | `Feed_NewestFirst_Paged`
- **DoD:** FE `fetchFeed(tab, page)` maps 1:1

#### - [ ] T4.2 Notifications (optional)
- **Scope:** HTTP list/unread count/mark read (`MarkNotificationAsRead` -> `Result`); SignalR payload aligned to FE (`createdAt, isRead, senderName, senderAvatar, targetId`, type `NewFollow`); skip self-notifications; outbox removes processed messages
- **Depends:** T1.3, T2.2 (sender projection)
- **Files:** `Features/Notifications/*`, `NotificationsController.cs` (new), `Infrastructure/Notifications/*`, `Domain/Notifications/Notification.cs`
- **Tests:** `Notifications_List_NewestFirst_Paged` | `MarkRead_OtherRecipient_Returns403` | `SelfLike_CreatesNoNotification` | `Outbox_ProcessedMessageRemoved`
- **DoD:** FE `/notifications` list & realtime payload render without blanks

#### - [ ] T4.3 Security hardening (required before any shared deployment)
- **Scope:** redact secrets in `LoggingBehavior` (passwords, OTP, tokens); `Mock*Sender` stops logging OTP outside Development; JWT secret required outside Development (no fallback); seed + admin token Development-only
- **Depends:** T1.5 (JWT config shape)
- **Files:** `Application/CQRS/Behaviors/Logging/*`, `Infrastructure/Identity/JwtProvider.cs`, `Infrastructure/*/Mock*Sender.cs`, `Program.cs`, `MockDataStore.cs`
- **Tests:** `Login_LogsNoPasswordOrToken` (captured logger) | `Production_MissingJwtSecret_FailsStartup`
- **DoD:** BG §10.7, §10.8, §10.13 resolved

## 6. FE integration checkpoints

FE work itself is out of scope; each checkpoint = BE contract frozen for that FE slice + test evidence

| CP | After | FE slice unblocked | Verify (BE side) |
|---|---|---|---|
| CP0 | T1.7 | FE plumbing: base URL, error normalizer (1 ProblemDetails shape), JWT `user_id` decoder, login redirect `/login` | `curl -k https://localhost:49895/swagger/v1/swagger.json` 200; CORS preflight from `localhost:3000` |
| CP1 | T1.1-T1.9 | auth (login, register with username, forgot/reset, logout, silent refresh), post delete | integration suite green; manual Swagger run of login -> refresh -> logout |
| CP2 | T1.10, T2.2-T2.5 | profile header & edit, profile switcher (`GET /api/users/me`), post create/edit (return `PostDto`), post detail + thread, profile threads tab, saved page, like/bookmark | MAP endpoint rows updated; `swagger.json` regenerated (T2.6) |
| CP3 | T3.1-T3.3 | private account, follow requests, followers dialog, block lists, close friends | relation integration tests green |
| CP4 | T4.x | feed, notifications | per task |

- FE must not consume a slice before its CP; mocks remain for everything else
- Known FE-side follow-ups (record in FE roadmap, not done here): register sends `username`; follow status from `{followStatus}`; like/save use `PUT`/`DELETE`; thread route uses `/api/threads/{id}`; replies like with `targetType=2` when `kind=comment`

## 7. Docs to update when contracts change

Single owner per fact; others link, never copy

| Fact | Owner doc | Update trigger |
|---|---|---|
| Pipeline, error mapping, auth lifecycle, dispatch semantics, debt list | `backend/architecture/backend-guide.md` (§3, §5, §6, §7, §10, §12) | T1.1-T1.5, T1.3, T4.3 |
| Rules, events Live?, state machines, repo contracts | `backend/architecture/domain-model.md` (§4, §5, §6, §7) | T1.3, T1.4, T1.8, T2.5, T3.1 |
| Endpoint matrix, statuses, DTO shapes, coverage, decisions | `backend/integration/frontend-backend-mapping.md` (§1, §2, §3, §7 -> mark decided D-ids) | every task touching an endpoint |
| Decision status & task progress | this plan (§4 approval, §5 checkboxes) | each task close |
| Generic conventions (marker rules, projector pattern, set-based repo members) | `conventions/backend.md` | T1.1, T2.3 (only if pattern is new) |
| Stale older specs | `features/identities.md`, `features/user-profile-and-relations.md` -> replace endpoint content with link to MAP | T1.5, T3.1 |
| Test matrix | `features/backend-unit-test.md` (add API integration layer) | T0.1 |
| Swagger copy for FE | `ysocial-clients/web-app/docs/swagger.json` | T2.6, later contract changes |

## 8. Deferred work & known risks

### Deferred (not integration blockers)
- Feed, notifications HTTP + payload alignment, mute (T3.4, T4.x) - FE stays on mocks
- Search, tags, trending, suggestions, hashtags/mentions
- Pin, hide-like-count, reposts, polls, drafts, DMs, report
- Media upload & multi-image (`imageUrls`), close-friends audience (D17), profile tabs `replies` & `media`
- Create-profile, username change, deactivate/activate, change password, session list
- EF Core / PostgreSQL persistence, outbox persistence
- Access-token revocation list (mitigated by 15 min lifetime, D6)

### Known risks

| Risk | Impact | Mitigation |
|---|---|---|
| Static `MockDataStore` shared across tests | flaky/order-dependent tests | T0.1 reset seam + serialized collection |
| No rollback: exception after mutation keeps state & leaves events on static aggregates | partial writes; stale events dispatched by next request | validators run before handlers (T1.1/T1.6/T1.8); accept for in-memory; real fix = EF transaction (deferred) |
| Process-global event provider under concurrency | double/missed dispatch between concurrent requests | T1.3 atomic drain; full fix needs per-scope change tracking (EF) |
| Stored counters (`FollowersCount`, `LikeCount`) can drift from edges | wrong profile counts | T1.3 regression tests; option to compute counts in T2.2 if drift found |
| `Task.WhenAll` over same repo in existing handlers | breaks on EF `DbContext` | no new occurrences; fix during EF migration |
| BE restart wipes state; FE holds old ids/tokens | 404s/401s after restart | deterministic seed ids (T0.1); FE treats refresh 401 as logout |
| Comment ids vs post ids in `/posts/[id]` | reply deep links 404 | D13 `/api/threads/{id}` |
| `isBlockedBy` exposure | reveals who blocked viewer | D14 decision; switch to 404 is local to T2.2/T3.2 |
| FE `generated.ts` built from stale Swagger | type drift | T2.6 regenerate; integration tests are contract truth |
| D2 `code` derived from internal rule class names | renaming a rule silently breaks FE contract | T1.1 pins every emitted `code` in tests; rename = contract change (§7) |
| Toggle endpoints kept during transition | FE may call wrong one | remove toggles after FE CP2 (follow-up task) |
| Credentials/OTP in logs, permissive config | security exposure | T4.3 before any shared deployment |
