---
module: BE Recovery & FE Integration Plan
created: 2026-10-15
inputs: ../architecture/backend-guide.md (BG) | ../architecture/domain-model.md (DM) | ../integration/frontend-backend-mapping.md (MAP) | ../../conventions/backend.md
---

# BE RECOVERY & FE INTEGRATION PLAN

> **For agentic workers:** execute 1 task per session with `superpowers:executing-plans`, TDD per `test-driven-development`, finish with `verification-before-completion`. Track progress with `- [ ]` -> `- [x]` on task headers (§5.4)

- **Goal:** make BE safe to integrate (correct errors, auth lifecycle, events) & expose min read/write contract that replaces FE mocks for auth, profile, posts, threads, saved & relationship controls
- **Architecture:** keep Clean Architecture + MediatR pipeline + FluentValidation + DDD rules + in-memory `MockDataStore`; add explicit error catalog & HTTP mapping, read-model projections in Application, viewer access policy as single read-side gate
- **Tech stack:** ASP.NET Core 8, MediatR 14, FluentValidation 12, xUnit + FluentAssertions + NSubstitute, `Microsoft.AspNetCore.Mvc.Testing` 8.x (new)
- **Target read shape:** FE domain types (`PostItem`, `UserProfile`, `PostThread`, `FollowListPage`, `RelationSets`) = DTO target; FE swaps ONLY service bodies (`post-detail.md` decision 1). Deviations listed in §6 FE follow-ups

## 1. Goals & non-goals

### Goals
- Every expected failure returns documented status (`400/401/403/404/409`) + stable `code`; `500` ONLY for unexpected faults
- Login, refresh, logout, profile switch work end-to-end matching FE `api-client.ts` refresh contract
- All domain events dispatch in same request; failed requests leak no events into later requests
- MVP read endpoints for profile, post, user posts, saved, thread; viewer flags & counts; privacy/block enforced on reads & writes
- API-level regression suite that pins each fix

### Non-goals
- Real DB / EF Core migration (keep `MockDataStore`; BG §7.3). Result is NOT production-ready (§8)
- Wiring FE services to BE, FE feature work
- Search, tags, trending, pin, hide-like-count, reposts, polls, drafts, DMs, media upload, multi-image (§8)
- Shared-kernel (`Microservice.BuildingBlocks`) changes
- Full re-audit; facts in BG/DM/MAP are assumed unless task's first step contradicts them

## 2. Global constraints
- Conventions: `.context/conventions/backend.md` + global C# style (file-scoped namespaces, CRLF, `#region`, sort usings, records for simple DTOs)
- Features stay vertical slices: `Application/Features/<Area>/<UseCase>/<UseCase>.cs` (command/query + validator + handler in 1 file), handlers `internal sealed`
- New domain rules: `internal sealed record ...Rule : IBusinessRule` (`Message` then `BrokenWhen`) + explicit code & kind (D2)
- Commands return `Result`/`Result<T>`; aggregate rule failures stay exceptions (mapped by T1.1b), no rewrite of rules into `Result`
- Repo additions = new interface members on Domain contracts + mock impl; set-based (accept id collections) to stay EF-friendly; NO `Task.WhenAll` over same repo in new code (BG §10.12)
- **Viewer identity:** `viewerId` = profile `UserId` from JWT `user_id` (`IUserContext.UserId`), NEVER `AccountId`; anonymous = `null`
- **List reads:** access policy (§4.4) applied to every returned entity BEFORE pagination & counts; fixed number of repo calls per page (no per-item lookups, no N+1)
- **Refresh tokens:** every mutation under the shared per-account lock (§4.3)
- Swagger is NOT source of truth; acceptance = integration tests over real HTTP pipeline
- JSON: camelCase; ids GUID strings; `Enumeration` ints stay for existing request bodies; new read DTOs expose string unions (D9)
- Do not change FE code; FE checkpoints (§6) are verification hand-offs only

## 3. New evidence

| Fact | Impact | Source |
|---|---|---|
| `launchSettings.json` = `https://localhost:51607`; FE & `00-agentic-rules.md` = `49895` | FE cannot reach BE as-is | `src/YSocial.Api/Properties/launchSettings.json` |
| `BusinessRuleValidationException.BrokenRule` carries rule instance | rule classification readable in API, no shared-kernel change | `BB:Domain/BusinessRules/BusinessRuleValidationException.cs` |
| 45 rule files, all `internal sealed record`; 1 string-ctor throw (`UserRelationManager.cs:100`, close friend); 2 `EntityNotFoundException` throws | rules need public classification interface (D2); string throw must become coded rule | `Domain/*/Rules/*.cs`, `UserRelationManager.cs:30,100`, `MarkNotificationAsRead.cs:34` |
| `RefreshToken` stores `AccountId` only, no `UserId` | refresh cannot know active profile -> bind profile at issue/rotate (T1.5) | `Domain/Identities/RefreshToken.cs` |
| `Account._refreshTokens` = plain `List`, mutated in place on shared static aggregate | concurrent rotate/login on same account is data race | `Domain/Identities/Account.cs:23` |
| `MockUserBlockRepository.Remove` = `TryRemove` (hard) | `UserUnblockedEvent` lost same as unlike -> generic removed-aggregate fix (T1.3) | `Infrastructure/Data/MockUserBlockRepository.cs` |
| Singleton mock repos & `MockNotificationOutboxStore` capture static collection REFERENCES at construction (`_likes = MockDataStore.Likes`) | test reset MUST clear in place, never reassign static props | `Infrastructure/Data/Mock*Repository.cs`, `MockNotificationOutboxStore.cs` |
| `ProcessNotificationOutboxJob` hosted, polls every 1s | background mutation during tests | `Infrastructure/Notifications/Outbox/ProcessNotificationOutboxJob.cs` |
| Seed ids = `New()` & `CreatedAt = UtcNow` per process start | FE-held JWT/ids dangle after restart; tests can't reference seed; ordering not deterministic | `MockDataStore.SeedMockData` |
| No `Program` partial; App/Infra types `internal` | `WebApplicationFactory` & handler tests need seams (T0.1) | `Program.cs` |
| `Post` has no comment counter | `commentsCount` computed by query (T2.3) | `Domain/Posts/Post.cs` |
| FE refresh = `POST /api/identities/refresh-token {refreshToken}` -> reads `accessToken`, `refreshToken`; no auth header | route & shape for D5 | FE `src/lib/api-client.ts:121` |
| FE refresh single-flight: per-tab `isRefreshing` + `failedQueue` (OK within 1 tab); tokens persisted in `localStorage` shared by tabs, NO cross-tab lock; failure redirects `/auth/login` (route is `/login`) | 2 tabs refresh same token -> loser gets 401 -> `clearAuth` logs out ALL tabs (D6) | FE `api-client.ts:9-25,97-160`, `features/auth/store/auth-store.ts:47` |
| FE `apiClient.delete(path, options)` sends no body | DELETE endpoints must be resource routes (D10) | FE `api-client.ts` `apiClient.delete` |
| FE username pattern `^[a-z0-9._]{1,30}$` + min 3 | register validator target (T1.8) | FE `features/auth/utils/mock-session.ts:8`, `features/auth/types/index.ts:93` |
| FE `updatePostContent`/`updateProfile` consume RETURNED projection | update endpoints return read DTO (D7) | FE `post-service.ts:378`, `profile.md` |
| FE `setPrivateAccount(false)` returns `{ acceptedCount }` | privacy endpoint contract (T3.1) | FE `mocks/privacy.ts:15` |

## 4. Contract decisions

| # | Decision | Contract | Owner |
|---|---|---|---|
| D1 | Error envelope & mapping | RFC 7807 `ProblemDetails` on EVERY error (`type`, `title`, `status`, `detail`, `instance`, ext `code`, `traceId`); validation adds `errors: { field: string[] }` (camelCase keys); explicit `Result` & exception tables in §4.1 | T1.1a |
| D2 | Stable error codes | codes come from explicit catalog (§4.1), NEVER from class names; each rule declares `Code` & `Kind` via public `IClassifiedRule`; unclassified rule -> `400 BusinessRuleViolated` + reflection test forbids unclassified rules | T1.1b |
| D3 | Login failure | unknown account, deleted account & wrong password -> identical `401 InvalidCredentials` (same body; unknown account still runs 1 dummy bcrypt verify to equalize timing); password verified FIRST, `403 AccountInactive` returned ONLY after valid credentials -> reveals state only to credential holder, no enumeration; FE identity step validates format only | T1.4 |
| D4 | Session cap (5) | 6th login evicts oldest active token (no error), under session lock | T1.4 |
| D5 | Refresh | `POST /api/identities/refresh-token` anonymous, body `{refreshToken}` -> 200 `LoginResponse`; rotation revokes old & records `ReplacedByTokenId`; expired/revoked/rotated/unknown -> `401 InvalidRefreshToken`; token bound to profile `UserId` | T1.5 |
| D6 | Token lifetimes | access 15 min (`Jwt:AccessTokenMinutes`), refresh 7 days; no per-request revocation: access tokens stay valid until expiry after logout/rotation; EVERY refresh-token list mutation serialized by 1 shared per-account lock (§4.3); FE MUST add cross-tab single-flight before CP1 (§6) | T1.4 (lock), T1.5 |
| D7 | Write responses | create post/comment -> 201 `PostDto` + `Location`; update post/comment -> 200 `PostDto`; update profile -> 200 `UserProfileDto`; delete/restore/other no-payload -> 204; register -> 201 `{accountId}` | T1.9, T2.2, T2.3, T2.5 |
| D8 | Follow response | 200 `{ "followStatus": "accepted" \| "pending" }` | T1.9 |
| D9 | Enum values in read DTOs | lowercase-camel strings of BE enum names: `followStatus` `none \| pending \| accepted`; `visibility` `public \| followersOnly \| private`; `kind` `post \| comment`; request bodies keep ints | T2.2, T2.3 |
| D10 | Like/save semantics | idempotent resource routes, no bodies: `PUT`/`DELETE /api/posts/{id}/like`, `/api/comments/{id}/like`, `/api/posts/{id}/bookmark`, `/api/comments/{id}/bookmark` -> 204; toggles kept until FE CP2, then removed | T1.10 |
| D11 | Username at register | required `username`; FORMAT = validator (`^[a-z0-9._]{3,30}$` -> 400 `ValidationFailed`); UNIQUENESS = handler, case-insensitive incl. soft-deleted (409 `UsernameTaken`); email uniqueness real (409 `EmailTaken`); not editable (MVP) | T1.8 |
| D12 | Unified post/comment DTO | keep `Comment` aggregate; single `PostDto` for both kinds, schema §4.2; parent comment MUST belong to same post (else `400 ParentCommentMismatch`); parent comment unknown, soft-deleted or inaccessible to viewer -> `404 NotFound` (same as deleted content elsewhere, D20); nesting unbounded (FE navigates deeper via thread) | T2.3 (schema & projector), T2.5 (thread) |
| D13 | Thread route | `GET /api/threads/{id}` resolves post OR comment id -> `ThreadDto` (§4.2); deleted/hidden/blocked -> 404 | T2.5 |
| D14 | Block policy | block either direction -> `404 NotFound` for ALL discovery & content: profile by id/username, user posts, follow lists of that user, post/thread reads, interaction writes (follow, like, bookmark, comment) on their content; ONLY exception = viewer's own block list (`GET /api/users/me/blocks`); `isBlockedBy` & `RelationSets.blockedBy` never expose data; applies to EVERY returned entity incl. nested ones (§4.4) | T2.1-T2.5, T3.2, T3.3 |
| D15 | Private profile (not blocked) | 200 `UserProfileDto` with exactly non-owner field set (§4.2); content lists -> 200 `locked: true`, empty `items`, `totalCount: 0`; `locked` (private) is ALWAYS distinct from `404` (blocked/deleted/unknown) | T2.2, T2.4, T3.2 |
| D16 | Pagination | offset `page` (1-based) & `pageSize` (default 10, max 50; relation lists default 20); envelope `{ items, page, pageSize, totalCount, hasNextPage }`; invalid input (`page < 1`, `pageSize < 1 or > 50`) -> 400 `ValidationFailed`; valid page beyond last -> 200 empty `items` + real metadata | T1.2, T2.4 |
| D17 | Post audience on create | MVP none (all Public); `closeFriends` audience deferred | §8 |
| D18 | Media | `imageUrl` optional single URL; no upload endpoint | T1.6 |
| D19 | Dev origin & seed | `launchSettings` -> `https://localhost:49895`; CORS from `Cors:AllowedOrigins`; seed ids & timestamps deterministic | T0.1, T1.7 |
| D20 | Deleted profile content | content of soft-deleted profiles hidden from all reads (404 on direct read) | T2.1 |

### 4.1 Error catalog & HTTP mapping (D1, D2)

- **Catalog:** `Domain/Common/Errors/ErrorCodes.cs` (public `const string`, owned by Domain so rules & Application share it); MAP §1 owns the published list after T1.1b
- **Rule classification:** `public interface IClassifiedRule : IBusinessRule { string Code { get; } RuleViolationKind Kind { get; } }`, `public enum RuleViolationKind { Invalid, Forbidden, NotFound, Conflict }` in `Domain/Common/Rules/`
- **Result codes:** `Result.Fail/NotFound/Conflict/Validation/Unauthorized/Forbidden(message, code?)`; `code` default per `ErrorType` (table below)

| Source | Condition | HTTP | Default `code` |
|---|---|---|---|
| `Result` | `ErrorType.Validation` | 400 | `ValidationFailed` |
| `Result` | `ErrorType.Business` | 400 | `BusinessRuleViolated` |
| `Result` | `ErrorType.Unauthorized` | 401 | `Unauthenticated` |
| `Result` | `ErrorType.Forbidden` | 403 | `Forbidden` |
| `Result` | `ErrorType.NotFound` | 404 | `NotFound` |
| `Result` | `ErrorType.Conflict` | 409 | `Conflict` |
| `Result` | failure with `ErrorType.None` (bug) | 500 | `InternalError` |
| exception | `FluentValidation.ValidationException` | 400 | `ValidationFailed` + `errors` |
| exception | `BusinessRuleValidationException` + `IClassifiedRule` | Kind: Invalid 400, Forbidden 403, NotFound 404, Conflict 409 | rule `Code` |
| exception | `BusinessRuleValidationException` unclassified / string ctor | 400 | `BusinessRuleViolated` |
| exception | `EntityNotFoundException` | 404 | `NotFound` |
| exception | any other | 500 | `InternalError` (`detail` generic outside Development) |
| framework | model binding / malformed JSON / bad enum int | 400 | `ValidationFailed` + `errors` |
| framework | JWT missing/invalid on `[Authorize]` | 401 | `Unauthenticated` |
| framework | authorization denied | 403 | `Forbidden` |
| framework | route not matched / `{id:guid}` mismatch | 404 | `NotFound` |

Initial specific codes (non-exhaustive; T1.1b completes per rule, MAP §1 publishes):

| Area | Code -> HTTP |
|---|---|
| Auth | `InvalidCredentials` 401, `InvalidRefreshToken` 401, `AccountInactive` 403, `InvalidOtp` 400, `OtpAttemptsExceeded` 400 |
| Account/profile | `EmailTaken` 409, `UsernameTaken` 409, `ProfileNotOwned` 403, `CannotDeleteDefaultProfile` 400, `AccountRequiresProfile` 400, `ProfileFieldInvalid` 400 |
| Post | `NotPostAuthor` 403, `PostNotDeleted` 400, `PostContentInvalid` 400 |
| Comment | `NotCommentAuthor` 403, `NotCommentAuthorOrPostOwner` 403, `NotCommentDeleter` 403, `CommentsDisabled` 400, `PostDeleted` 400, `ParentCommentMismatch` 400, `CommentContentInvalid` 400 |
| Graph | `CannotFollowSelf` 400, `CannotBlockSelf` 400, `CloseFriendRequiresAcceptedFollow` 400, block either way -> `NotFound` 404 (D14), missing/deleted target -> `NotFound` 404 |
| Notification | `NotNotificationRecipient` 403 |

### 4.2 Read DTO contracts (D7, D9, D12, D14, D15)

```yaml
PostDto:                       # used for posts AND comments (FE PostItem)
  id: guid
  kind: post | comment
  postId: guid                 # root post id; == id when kind=post
  parentId: guid?              # kind=comment ONLY: parent comment id, or postId for top-level comment; absent for posts
  content: string
  imageUrl: string?            # posts only; always absent for comments
  createdAt: datetime
  isEdited: bool               # UpdatedAt != null
  likesCount: int              # Post.LikeCount | Comment.LikeCount; stored aggregate, NOT viewer-filtered
                               # (accepted exception §4.4: number only, no identities)
  commentsCount: int           # DIRECT children only: post -> top-level comments (PostId match & ParentCommentId null);
                               # comment -> comments with ParentCommentId match; same §4.4 filter as thread replies
  isLikedByCurrentUser: bool   # like target type = kind; false for anonymous
  isBookmarkedByCurrentUser: bool   # saved target type = kind; false for anonymous
  user: { id, username, displayName, avatarUrl?, isVerified: false }
  visibility: public | followersOnly | private   # comments inherit root post; MVP always public (D17)
ThreadDto:                     # FE PostThread
  post: PostDto                # requested item (post or comment)
  parent: PostDto?             # kind=comment: parent comment, or root post for top-level comment;
                               # null when parent inaccessible (§4.4) - never a stub revealing it exists
  replies: PostDto[]           # direct accessible children, newest first
  childReplies: { [replyId]: PostDto[] }   # 1 level below replies, newest first, same filter
UserProfileDto:                # FE UserProfile; SAME field set for every viewer incl. owner (no email, no profiles)
  id, username, displayName, bio?, avatarUrl?, coverUrl?
  followersCount, followingCount   # computed on read: accepted edges whose other party is discoverable to viewer
                                   # (= totalCount of followers/following lists); stored counters not exposed
  isPrivate, isVerified: false
  followStatus: none | pending | accepted    # viewer -> target edge
  isFollowing: bool            # followStatus == accepted
  viewerMarkedCloseFriend: bool   # flag set by viewer, dormant included
  isMuted: bool                # viewer muted target (false until T3.4)
  isBlocked: bool              # viewer blocked target; true ONLY in viewer's own block list (D14 exception)
  isBlockedBy: bool            # target blocked viewer; ALWAYS false (any such read is 404); kept for FE type compat
  # private & non-owner & not accepted (D15): identical field set, values as above; isPrivate=true,
  #   followStatus none|pending, isFollowing=false; NO extra/hidden fields; content lists answer locked
MeDto:                         # ONLY GET /api/users/me (owner); never embedded in other responses
  profile: UserProfileDto
  email: string
  profiles: [{ id, username, displayName, avatarUrl?, isDefault }]   # account's profiles, switcher
PagedResponse<T>: { items: T[], page, pageSize, totalCount, hasNextPage }
UserPostsPageDto: PagedResponse<PostDto> + { locked: bool }
FollowListPageDto: PagedResponse<UserProfileDto> + { locked: bool }
RelationSetsDto: { blocked: guid[], muted: guid[], closeFriends: guid[], isPrivate, requestCount }   # no blockedBy (D14)
```

- **Status outcomes per profile/content read:** accessible -> 200 data | private & not permitted -> 200 `locked: true` (lists) / 200 profile | blocked either way, deleted, unknown, inaccessible post -> 404 `NotFound`. Response NEVER mixes `locked` with 404 semantics

### 4.3 Session synchronization (D4, D5, D6)

- **Mechanism:** 1 `IAccountSessionLock` (Application abstraction, Infrastructure singleton: `ConcurrentDictionary<AccountId, SemaphoreSlim(1,1)>`, `Task<IAsyncDisposable> AcquireAsync(AccountId, ct)`); NO other lock touches `Account` refresh tokens
- **Covered paths (ALL refresh-token list mutations):** login (`RemoveExpiredTokens`, eviction, `AddRefreshToken`), refresh rotation, logout revocation, switch-profile rotation, reset-password `RevokeAllRefreshTokens`, delete-account revocation
- **Critical section:** acquire -> (re)load account -> validate token state -> mutate -> `Update` -> release; validation done BEFORE acquiring is advisory only & MUST be repeated under lock. Token-keyed paths (refresh, logout): lookup account by token without lock, acquire lock for that `AccountId`, re-read & re-validate
- **Token family:** rotation sets `ReplacedByTokenId` on old token; logout of rotated token revokes its active descendants -> logout always ends session it names
- **Concurrent outcomes:** 2x refresh same token -> exactly 1 x 200, other 401 `InvalidRefreshToken` | refresh ‖ logout same token: logout first -> refresh 401; refresh first -> refresh 200 & logout revokes successor via family; logout ALWAYS 204; final state in both orders = 0 active tokens in family | login ‖ login at cap -> active count never > 5 | switch ‖ refresh same token -> exactly 1 rotation succeeds | reset-password ‖ refresh -> refresh either 401 or its new token revoked by reset (no active token survives reset)
- **Scope limit:** lock is process-local (in-memory, single instance); multi-instance needs DB concurrency token (deferred)

### 4.4 Access policy coverage (D14, D15, D20)

- **Entity accessibility:** user = discoverable (not blocked either way with viewer, not deleted) | post = author discoverable & content visible & `Visibility` allows & not deleted | comment = root post accessible & author discoverable & not deleted
- **Applies to EVERY returned entity**, incl. nested: `PostDto.user`, thread `post`/`parent`/`replies`/`childReplies`, saved posts, user posts, followers/following, follow requests, block/mute lists (own lists: block list exempt per D14), `me.profiles` (own)
- **Before pagination & counting:** filter inaccessible entities first, then `totalCount`, `hasNextPage`, page slice; `commentsCount`, `followersCount`, `followingCount`, `requestCount` use SAME filter as their lists
- **No indirect disclosure:** inaccessible parent -> `parent: null` (no stub); hidden reply -> omitted & not counted; inaccessible item in saved list -> omitted & not counted; error responses never name hidden entities (`detail` generic)
- **Accepted exception:** `likesCount` = stored aggregate number (no identities); revisit if likers list is added
- **Implementation:** all via `IViewerAccessPolicy.GetContextAsync` batch (T2.1); handlers MUST NOT re-implement checks

## 5. Phases, tasks & dependencies

### 5.1 Dependency graph

```
Phase 0 (sequential)      T0.1 harness ──> T0.2 characterization
                                  │
Phase 1 (foundation)      ┌───────┴──────────┬─────────────────────┐
                          T1.1a error        T1.3 events          T1.7 dev cfg (no deps)
                          pipeline           │
                          │                  │
                          T1.1b rule codes   │
                          │                  │
              ┌───────────┼───────────┐      │
              T1.2 query  T1.4 logout T1.6   │
              validation  │           text   │
                          T1.5 refresh post  │
                          │                  │
                          T1.8 username      │
                          │                  │
                          T1.9 status cleanup│
                          │                  │
                          T1.10 like/save <──┘ (counts need T1.3)
Phase 2 (read MVP)        T2.1 access policy (needs T1.1b, T1.3)
                          ├──> T2.2 profile reads (needs T1.8, T1.9)
                          └──> T2.3 PostDto + projector (needs T1.6, T1.9)
                                 ├──> T2.4 paged lists (needs T1.2)
                                 └──> T2.5 thread + comment writes (needs T1.10)
                          T2.6 contract snapshot (needs T2.2..T2.5) ──> CP2
Phase 3 (graph)           T3.1 privacy + requests ──> T3.2 lists + relation sets ──> T3.4 mute (optional)
                          T3.3 write enforcement (needs T2.1, T2.5, T1.10)
Phase 4 (optional)        T4.1 feed | T4.2 notifications | T4.3 security hardening
```

### 5.2 Task classification

| Class | Meaning | Tasks |
|---|---|---|
| Blocker | FE slice cannot start without it | T0.1, T0.2, T1.1a, T1.1b, T1.2-T1.9, T2.1-T2.6, T3.1, T3.2 |
| Blocker-for-quality | FE works without it but would ship known-wrong behavior | T1.10 (toggle races), T3.3 (write leaks) |
| Optional feature | FE slice stays on mocks until done | T3.4, T4.1, T4.2 |
| Debt cleanup | not FE-visible; REQUIRED before shared deployment | T4.3 |

### 5.3 Parallel lanes (separate sessions, no shared files)

| Lane | Tasks (in order) | Shared files forcing order |
|---|---|---|
| A errors/API | T1.1a -> T1.1b -> T1.2 | `ApiController.cs`, `Program.cs`, rule files |
| B events | T1.3 -> (wait T1.1b) T2.1 | `MockDataStore.cs`, mock repos, dispatcher |
| C identity | T1.4 -> T1.5 -> T1.8 -> T1.9 -> T1.10 | `IdentitiesController`, `Account.cs`, `JwtProvider`, `UsersController`, Likes/Saved controllers |
| D small | T1.7 (any time); T1.6 after T1.1b | `CreatePost.cs` only |
| E reads | T2.2 ‖ T2.3; then T2.4 ‖ T2.5; then T2.6 | T2.2 `UsersController` vs T2.3 `PostsController`; T2.4 Posts/Saved vs T2.5 Comments/Threads |
| F graph | T3.1 -> T3.2 -> T3.4; T3.3 ‖ T3.1 | T3.1/T3.2/T3.4 share `UserRelationsController` & relation repo; T3.3 touches Likes/Saved/AddComment only |

- After T0.2: A, B, D start in parallel; C starts after T1.1b (assertions need codes)
- `MockDataStore.cs` edits: T0.1 (reset/seed) before T1.3 (queues) -> T1.3 MUST register its removed-events queue in `ResetForTests()`
- Contract changes after T2.6 (Phase 3/4) re-run T2.6 snapshot step as part of their DoD

### 5.4 Tasks

Every task DoD also includes: `dotnet build YSocial.sln` 0 errors & 0 new warnings, all test projects green, usings sorted, docs per §7 updated. Tests asserting error bodies may only be required once T1.1a/T1.1b are merged (all tasks below already depend on them where needed)

---

#### - [x] T0.1 Integration test harness, full reset & deterministic seed
- **Scope:** new `tests/YSocial.Api.IntegrationTests` (xUnit, FluentAssertions, `Microsoft.AspNetCore.Mvc.Testing` 8.x) in `YSocial.sln`; `public partial class Program;`; `InternalsVisibleTo("YSocial.Api.IntegrationTests")` on Application & Infrastructure; `ApiFactory` removes `ProcessNotificationOutboxJob` hosted service (outbox tests call processing directly); `AuthHelper.LoginAsync(loginId, password)` -> bearer client; `[Collection("Api")]` with parallelization disabled
- **Reset (`MockDataStore.ResetForTests()`):** `Clear()` IN PLACE every static collection (9 dictionaries + outbox `Messages`; NEVER reassign: singleton repos & `MockNotificationOutboxStore` hold references), which also drops pending aggregate events, refresh tokens/sessions (inside `Account`), OTP tokens, notifications; then reseed. Inventory step: grep Infrastructure/Application for other `static` mutable state & singleton fields; each found item gets reset or documented reason
- **Deterministic seed:** fixed GUIDs (`SeedIds` constants) & fixed `CreatedAt` per entity via Infrastructure-only seed helper (reflection on private setters allowed ONLY in seed code); password hashes computed once & cached (bcrypt cost)
- **Depends:** none
- **Files:** `tests/YSocial.Api.IntegrationTests/**`, `src/YSocial.Api/Program.cs`, `src/YSocial.Infrastructure/Data/MockDataStore.cs`, `Data/Seed/*` (new), `*.csproj`
- **Tests:** `Smoke_GetSeedPost_Returns200` | `Reset_RestoresSeed_AfterMutation` (create post + follow + login -> reset -> seed counts, 0 notifications, 0 active refresh tokens on seed accounts) | `Reset_RepositoriesSeeSameCollections` (write via repo after reset -> visible in `MockDataStore`) | `Seed_IdsStableAcrossResets`
- **DoD:** suite green twice in a row & in random order; every test starts from identical seed

#### - [x] T0.2 Characterization & probe tests
- **Scope:** pin behavior that MUST survive; resolve BG §12 & MAP §8 probes; target-behavior tests for known defects as `[Fact(Skip = "T1.x")]`, un-skipped by owner task
- **Depends:** T0.1
- **Files:** `tests/YSocial.Api.IntegrationTests/Characterization/*.cs`
- **Tests (pass now):** register -> login -> create post (with `imageUrl`) -> get post 200 | `FollowPublicUserTwice_BothReturn200Accepted_SingleEdge`: both responses 200 with status `Accepted` (current raw-string form; T1.9 updates assertion to `{followStatus:"accepted"}`), exactly 1 `UserRelation` for (observer, target), not deleted, status `Accepted`, no Pending transition | unfollow absent edge -> 204 | block twice -> 204 | toggle like on/off | saved toggle + `GET /api/saveditems/posts` lists post | update profile 200 | switch profile -> token with other `user_id` | delete post then `GET` 404 | restore by author
- **Probes (record in BG §12 as `Verified`):** non-author `PUT /api/posts/{id}` status/body | follow response content type with & without `Accept: application/json` | GUID JSON shape of register & create-post | `sub` -> `AccountId` readable
- **DoD:** probes answered; skipped tests compile & reference owner task

#### - [x] T1.1a Error pipeline & `Result` codes
- **Scope:** D1, §4.1 rows `Result`, `exception` (except rule classification), `framework`. `AddProblemDetails`; `GlobalExceptionHandler : IExceptionHandler` + `UseExceptionHandler`; `UseStatusCodePages` for empty 401/403/404; `InvalidModelStateResponseFactory` adds `code=ValidationFailed`; `ErrorCodes` catalog; optional `code` on `Result` factories with per-`ErrorType` defaults; `ApiController.ProcessErrorResponse` -> same ProblemDetails builder; bare-string 400 in `LikesController`/`SavedItemsController` removed
- **Depends:** T0.2
- **Files:** `src/YSocial.Api/Infrastructure/Errors/*` (new), `Program.cs`, `Controllers/ApiController.cs`, `LikesController.cs`, `SavedItemsController.cs`, `Application/CQRS/Results/*`, `Domain/Common/Errors/ErrorCodes.cs` (new)
- **Tests:** one per §4.1 generic row: `ResultValidation_Returns400_ValidationFailed` | `ResultConflict_DuplicateEmail_Returns409` | `ValidatorFailure_Returns400_WithErrorsCamelCase` | `MalformedJson_Returns400_ValidationFailed` | `NoToken_Returns401_Unauthenticated` | `UnknownRoute_Returns404_NotFound` | `EntityNotFound_FollowMissingUser_Returns404` | `Unhandled_Returns500_InternalError_NoStackOutsideDev` (throwing handler via test override) | `ErrorBody_HasTraceIdAndInstance`
- **DoD:** every non-2xx body in suite is ProblemDetails with `status`, `title`, `code`; no 500 for validation failures

#### - [x] T1.1b Rule classification & stable codes
- **Scope:** D2. `IClassifiedRule` + `RuleViolationKind`; classify all 45 rules with explicit `Code` from catalog & `Kind`; replace string throw `UserRelationManager.cs:100` with `CloseFriendRequiresAcceptedFollowRule`; follow/interaction on blocked pair -> `Kind=NotFound` (D14); handler maps `BusinessRuleValidationException` by Kind
- **Depends:** T1.1a
- **Files:** `Domain/Common/Rules/*` (new), `Domain/*/Rules/*.cs` (45), `Domain/UserRelations/Services/UserRelationManager.cs`, `Api/Infrastructure/Errors/*`
- **Tests:** `AllRules_AreClassified` (reflection over Domain assembly) | `AllRuleCodes_ExistInCatalog` | `NonAuthorEditPost_Returns403_NotPostAuthor` | `FollowSelf_Returns400_CannotFollowSelf` | `FollowBlockedEitherWay_Returns404_NotFound` | `CloseFriendWithoutFollow_Returns400` | `RestoreNotDeletedPost_Returns400_PostNotDeleted` | `InvalidOtp_Returns400_InvalidOtp` | `CodesSnapshot_MatchesApprovedList` (pins every emitted code; rename = contract change)
- **DoD:** no rule failure produces 500; codes independent of class names (renaming a rule class leaves tests green)

#### - [x] T1.2 Query validation & pagination bounds
- **Scope:** D16. Relax `ValidationBehavior` constraint to all requests (queries validated; `TransactionBehavior` still commands-only); `page >= 1`, `1 <= pageSize <= 50`; shared pagination rules for new list queries; `PagedList.TotalPages` divide-by-0 guard; page beyond last -> 200 empty items + metadata
- **Depends:** T1.1b
- **Files:** `Application/CQRS/Behaviors/Validation/ValidationBehavior.cs`, `Features/Posts/GetPost*/`, `Models/Commons/PagedList.cs`, `Application/CQRS/Validation/` (new)
- **Tests:** `UserPosts_PageSize0_Returns400` | `UserPosts_PageSize51_Returns400` | `UserPosts_Page0_Returns400` | `UserPosts_PageBeyondLast_Returns200EmptyWithMetadata` (`totalCount` real, `hasNextPage=false`) | `GetPost_EmptyGuid_Returns400` | regression `UserPosts_Default_Returns10NewestFirst`
- **DoD:** queries never trigger `UnitOfWork.CommitAsync`

#### - [x] T1.3 Domain-event dispatch reliability
- **Scope:** (a) provider scans ALL aggregate sets incl. `UserRelations`, `UserBlocks`, `Notifications`; (b) hard-removing mock repos (`Like`, `UserBlock`, `Notification`) move pending events into removed-events queue before `TryRemove`; queue registered in `ResetForTests()`; (c) atomic `DrainDomainEvents()` on local `IDomainEventsProvider` (`Infrastructure/Messaging/DomainEventsDispatching/IDomainEventsProvider.cs`, not shared kernel), lock around snapshot + clear; (d) dispatcher loops drain -> publish until empty, max 5 passes, then error log + `InvalidOperationException`
- **Failure isolation (no leaks):** `TransactionBehavior`: handler exception OR failed `Result` -> skip commit, drain & DISCARD pending events, log warning with request name & discarded event types; dispatch failure mid-loop -> remaining drained events discarded (never re-queued), error logged, request -> 500 `InternalError`. In-memory mutations are NOT rolled back (documented)
- **Concurrency (document in BG §7.2, do not fix):** provider is process-global; drain can pick up or discard events raised by concurrent request; discard-on-failure can drop another request's events; mitigation = lock only. This architecture is NOT production-ready; real fix = per-scope change tracking (EF `DbContext`)
- **Depends:** T0.2 (parallel with lane A)
- **Files:** `Infrastructure/Data/MockDataStore.cs`, `MockLikeRepository.cs`, `MockUserBlockRepository.cs`, `MockNotificationRepository.cs`, `Infrastructure/Messaging/DomainEventsDispatching/*`, `Application/CQRS/Behaviors/UnitOfWork/TransactionBehavior.cs`
- **Tests:** `FollowPublicUser_IncrementsCounts` | `FollowPublicUserTwice_CountsIncrementOnce` | `Unfollow_DecrementsCounts` | `Unlike_DecrementsPostLikeCount` | `UnlikeComment_DecrementsCommentLikeCount` | `Block_RemovesFollowsBothDirections_CountsInSameRequest` | `Unblock_LeavesNoPendingEvents` | `FollowPublicUser_CreatesFollowAcceptedNotification` | `DeletePost_SoftRemovesSavedItems_InSameRequest` | `FailedCommand_DoesNotLeakEventsIntoNextRequest` (rule throws after `AddDomainEvent` -> next unrelated request dispatches nothing) | `FailedResult_SkipsCommit` | `Dispatcher_StopsAfterMaxPasses` (unit, fake provider) | `Provider_EmptyAfterEveryRequest`
- **DoD:** DM §6 "Live?" = yes for every reachable event; BG §7.2 rewritten with concurrency & non-production statement

#### - [x] T1.4 Logout, session eviction, uniform login failure
- **Scope:** D3, D4, §4.3. Introduce `IAccountSessionLock` (§4.3) & apply it to login, logout, reset-password, delete-account (T1.5 adds refresh & switch); `IAccountRepository.GetByRefreshTokenAsync(token)`; logout `[AllowAnonymous]`, body `{refreshToken}` (format-validated only: non-empty), ALWAYS 204 for active, unknown, revoked, expired or rotated tokens; active -> revoked; rotated -> active descendants revoked (family, field added in T1.5; until then rotated = revoked no-op); logout does NOT invalidate issued access tokens (valid until expiry, D6); `AddRefreshToken` evicts oldest active at cap; login per D3 (password first, uniform 401, dummy hash for unknown, `403 AccountInactive` only after valid password, deleted account = 401)
- **Depends:** T1.1b
- **Files:** `Application/Abstractions/Identity/IAccountSessionLock.cs` (new), `Infrastructure/Identity/AccountSessionLock.cs` (new, singleton), `Features/Identities/{LogoutUser,Login,ResetPassword,DeleteAccount}/`, `Domain/Identities/Account.cs`, `IAccountRepository.cs`, `MockAccountRepository.cs`, `IdentitiesController.cs`, `tests/YSocial.Domain.UnitTests/Identities/AccountTests.cs` (new)
- **Tests:** `Logout_ActiveToken_Returns204_TokenRevoked` | `Logout_UnknownToken_Returns204` | `Logout_RevokedToken_Returns204` | `Logout_ExpiredToken_Returns204` | `Logout_Twice_Returns204` | `Logout_WithoutAccessToken_StillRevokes` | `Logout_EmptyBody_Returns400_ValidationFailed` | `Logout_AccessTokenStillValidUntilExpiry` (documents D6) | `SixthLogin_EvictsOldestSession` (domain + API) | `ConcurrentLogins_AtCap_ActiveNeverAbove5` (20 parallel) | `ConcurrentLogoutAndLogin_NoListCorruption` | `Login_UnknownWrongPasswordDeleted_IdenticalBody401` | `Login_InactiveWithWrongPassword_Returns401` | `Login_InactiveWithValidPassword_Returns403` | regression `ResetPassword_RevokesAllTokens`
- **DoD:** 10x login/logout loop never locks account; every token-list mutation path in this task goes through `IAccountSessionLock` (grep check in review)

#### - [x] T1.5 Refresh endpoint, profile-bound tokens, access lifetime
- **Scope:** D5, D6. `RefreshToken.UserId` set at login (resolved profile) & `SwitchProfile` (target); `RotateRefreshToken` carries `UserId`; `RefreshTokenCommand(refreshToken)`: token must exist, be active (not expired, not revoked), bound profile must exist, not be deleted & belong to token's account, account active & not deleted -> rotate & return `LoginResponse`; any failure -> `401 InvalidRefreshToken`; switch to profile of other account -> `403 ProfileNotOwned`; refresh & switch-profile use SAME `IAccountSessionLock` from T1.4 across full read-modify-write (no second lock); `RefreshToken.ReplacedByTokenId` set on rotation & logout family revocation enabled (§4.3); `Jwt:AccessTokenMinutes` default 15
- **Depends:** T1.4
- **Files:** `Domain/Identities/{RefreshToken,Account}.cs` (`UserId`, `ReplacedByTokenId`, family revoke), `Features/Identities/{RefreshToken (new),LogoutUser}/`, `Features/Users/SwitchProfile/`, `Features/Identities/Login/`, `Infrastructure/Identity/JwtProvider.cs`, `IdentitiesController.cs`, `appsettings.json`
- **Tests:** `Refresh_Valid_ReturnsNewPair_RevokesOld` | `Refresh_RotatedToken_Returns401` | `Refresh_ExpiredToken_Returns401` (expiry via test clock or seeded expired token) | `Refresh_RevokedByLogout_Returns401` | `Refresh_AfterSwitchProfile_KeepsSwitchedUserId` | `Refresh_DeletedProfile_Returns401` | `Refresh_DeletedAccount_Returns401` | `SwitchProfile_OtherAccountsProfile_Returns403` | `SwitchProfile_OtherAccountsRefreshToken_Returns401` | `AccessToken_ExpClaim_MatchesConfig` | regression `SwitchProfile_RotatesToken`
- **Race tests (parallel requests released by barrier, repeated 50x):** `Refresh_ConcurrentSameToken_ExactlyOne200` | `RefreshAndLogout_SameToken_BothOrders_NoActiveTokenLeft` (logout 204 always) | `Logout_RotatedToken_RevokesSuccessor` | `SwitchAndRefresh_SameToken_ExactlyOneRotation` | `ResetPasswordAndRefresh_NoActiveTokenSurvives` | `LoginAndRefresh_AtCap_ActiveNeverAbove5` | unit `AccountSessionLock_SameAccountSerialized_DifferentAccountsParallel`
- **DoD:** FE `api-client.ts` refresh contract satisfied (route, body, fields); all 6 mutation paths of §4.3 use 1 lock; MAP §1 records cross-tab requirement (§6)

#### - [x] T1.6 Text-only post creation
- **Scope:** D18. Remove `ImageUrl` NotNull/NotEmpty; when present: absolute http(s) URL, max 2048; `Content` non-empty & max 2000 in validator (field-level `errors`)
- **Depends:** T1.1b (400 assertions use its contract)
- **Files:** `Features/Posts/CreatePost/CreatePost.cs`
- **Tests:** `CreatePost_TextOnly_Returns2xx` | `CreatePost_EmptyContent_Returns400_ValidationFailed` | `CreatePost_ContentOver2000_Returns400` | `CreatePost_InvalidImageUrl_Returns400` | regression `CreatePost_WithImage_Returns2xx`
- **DoD:** text-only create succeeds; status assertions `2xx` until T2.3 fixes 201

#### - [x] T1.7 Dev integration config
- **Scope:** D19. `launchSettings` https `49895`; CORS from `Cors:AllowedOrigins` (dev `http://localhost:3000`), remove `SetIsOriginAllowed(_ => true)`; `appsettings.Development.json` non-secret dev values
- **Depends:** none
- **Files:** `Properties/launchSettings.json`, `Program.cs` (CORS block only), `appsettings*.json`
- **Tests:** `Cors_AllowedOrigin_GetsHeaders` | `Cors_UnknownOrigin_NoAllowOrigin`
- **DoD:** `dotnet run` serves `https://localhost:49895/swagger`; preflight from FE origin succeeds

#### - [x] T1.8 Register username & uniqueness
- **Scope:** D11. `RegisterAccountCommand(Email, Password, Username, PhoneNumber?)`; validator = format only (pattern, lengths, email/password format) -> 400; handler = uniqueness only (`IUserRepository.IsUsernameTakenAsync` case-insensitive incl. soft-deleted -> 409 `UsernameTaken`; real `IsEmailUniqueAsync` -> 409 `EmailTaken`), checked BEFORE account creation (orphan path closed); username flows via `AccountCreatedEvent` payload to profile init
- **Depends:** T1.5 (lane C order; logically T1.1b)
- **Files:** `Features/Identities/RegisterAccount/`, `Features/Identities/EventHandlers/InitializeUserProfileHandler*`, `Domain/Identities/Events/AccountCreatedEvent.cs`, `Domain/Users/IUserRepository.cs`, `MockUserRepository.cs`, `Api/Models/Identities/*`
- **Tests:** `Register_WithUsername_ProfileHasUsername` | `Register_InvalidUsernameFormat_Returns400_NotChecksUniqueness` | `Register_DuplicateUsernameCaseInsensitive_Returns409` | `Register_DuplicateEmail_Returns409` | `Register_Failure_LeavesNoOrphanAccount`
- **DoD:** BG §10.10 resolved

#### - [x] T1.9 Status code & response-shape cleanup (touched MVP endpoints)
- **Scope:** D7 (no-payload), D8. `Result<bool>` -> `Result` (204): DeletePost, RestorePost, DeleteComment, RestoreComment, DeleteProfile, SetDefaultProfile, DeleteAccount (UpdatePost/UpdateComment/UpdateProfile move to DTO in T2.3/T2.5/T2.2); register -> 201 `{accountId}`; follow -> `{ followStatus }`; `ApiController.Created...` helper; per-action `[Authorize]` on `UsersController` WRITE actions only, NEVER controller-level (T2.2 reads stay anonymous)
- **Depends:** T1.8
- **Files:** listed features, `IdentitiesController`, `PostsController`, `CommentsController`, `UsersController`, `UserRelationsController`, `ApiController.cs`
- **Tests:** 1 status test per changed endpoint | `Follow_ReturnsJsonFollowStatusLowercase` | `UpdateProfile_Anonymous_Returns401`
- **DoD:** endpoints listed in scope return no bare `true`/string; untouched non-MVP endpoints (e.g. share-link) out of scope

#### - [x] T1.10 Idempotent like/bookmark resource routes
- **Scope:** D10. `SetLikeCommand(targetId, targetType, liked)` & `SetSavedItemCommand(targetId, targetType, saved)` reusing toggle services (no-op when already in state); routes WITHOUT bodies, declared in `LikesController`/`SavedItemsController` via absolute route templates (`[HttpPut("/api/posts/{id:guid}/like")]`) so `PostsController`/`CommentsController` stay free for lane E -> 204
- **Depends:** T1.3 (counts), T1.9 (controller files)
- **Files:** `Features/Likes/SetLike/` (new), `Features/SavedItems/SetSavedItem/` (new), `LikesController.cs`, `SavedItemsController.cs`
- **Tests:** `PutPostLike_Twice_LikeCountIs1` | `DeletePostLike_WhenNotLiked_Returns204_Unchanged` | `PutCommentLike_UsesCommentTarget` | `PutBookmark_Twice_SingleSavedRow` | `DeleteRoute_HasNoBody` (request without body succeeds) | regression toggle endpoints unchanged
- **DoD:** FE `setPostLike(id, liked)` & `setPostBookmark` map 1:1 with `apiClient.put/delete(path)`

#### - [x] T2.1 Viewer access policy
- **Scope:** D14, D15, D20. `IViewerAccessPolicy` (Application): `viewerId` = `UserId?` (§2); `GetContextAsync(viewerId, candidateUserIds)` -> blocked-either-way set, relation map viewer->candidates (status, close-friend flag), deleted-user set, privacy flags (single batch per call); predicates `IsDiscoverable` (not blocked either way, not deleted), `CanViewContent` (owner | public | accepted follower), `CanViewPost` (discoverable & content visible & `Visibility`: Public | FollowersOnly needs accepted | Private owner only). Entity predicates `IsUserAccessible`, `IsPostAccessible`, `IsCommentAccessible` exactly as §4.4 + helpers `FilterUsers/FilterPosts/FilterComments` that callers MUST use before paging & counting. Repo additions (set-based): `IUserBlockRepository.GetBlockedEitherWayAsync(userId, candidateIds)`, `IUserRelationRepository.GetRelationsAsync(observerId, targetIds)`, `IUserRelationRepository.GetAcceptedEdgesAsync(userIds)` (both directions, for read-time counts), `IUserRepository.GetUsersByIdsAsync` incl. deleted flag
- **Depends:** T1.1b, T1.3
- **Files:** `Application/Features/Access/` (new), Domain repo contracts, mock repos, new `tests/YSocial.Application.UnitTests` (xUnit + NSubstitute, `InternalsVisibleTo`)
- **Tests (unit matrix):** owner sees own private | anonymous vs private -> locked | pending -> locked | accepted -> visible | block A->B & B->A -> undiscoverable for both | deleted author -> undiscoverable | FollowersOnly post vs non-follower -> hidden | dormant close-friend flag grants nothing | comment under inaccessible root post -> inaccessible | comment by blocked author under accessible post -> inaccessible | `GetContextAsync` calls each repo once for 50 candidates
- **DoD:** rules mirror FE `mocks/visibility.ts` except D14 (404 instead of blocked states); §4.4 is the only accessibility definition in code

#### - [x] T2.2 Profile reads & `me`
- **Scope:** `GET /api/users/{id:guid}`, `GET /api/users/by-username/{username}` (anonymous allowed) -> `UserProfileDto` (§4.2, same field set for every viewer, never `email`/`profiles`); `GET /api/users/me` ([Authorize]) -> `MeDto` (ONLY place exposing `email` & account profiles); blocked either way / deleted / unknown -> 404 (D14, D20); private non-accepted -> 200 same field set (D15); `followersCount`/`followingCount` computed on read with §4.4 filter (`UserProfileProjector`, batch for N profiles, reused by T3.1/T3.2 lists); `PUT /api/users/profiles/me` -> 200 `UserProfileDto` (D7)
- **Depends:** T2.1, T1.9
- **Files:** `Features/Users/{GetUserProfile,GetMe}/` (new), `Application/Models/{UserProfileDto,MeDto}.cs`, `Application/Features/Users/Projection/UserProfileProjector.cs` (new), `Features/Users/UpdateProfile/`, `UsersController.cs`
- **Tests:** `GetProfile_ById_CountsAfterFollow` | `GetProfile_Counts_ExcludeDeletedFollowers` | `GetProfile_Counts_EqualFollowListTotals` | `GetProfile_ByUsername_CaseInsensitive` | `GetProfile_Unknown_404` | `GetProfile_Deleted_404` | `GetProfile_ViewerBlockedTarget_404` | `GetProfile_TargetBlockedViewer_404` | `GetProfile_Private_NonFollower_200_ExactFieldSet` (JSON property set == §4.2 list, no `email`, no `profiles`) | `GetProfile_Public_NonOwner_NoEmail` | `GetProfile_Owner_ById_NoEmail` | `GetProfile_FollowStatus_None/Pending/Accepted` | `GetProfile_IsBlockedByAlwaysFalse` | `GetMe_Anonymous_401` | `GetMe_HasEmailAndProfiles` | `UpdateProfile_ReturnsProjection_NoEmail`
- **DoD:** FE `fetchUser`, `fetchUserByUsername`, `updateProfile`, `ensureViewerUser` covered 1:1

#### - [x] T2.3 `PostDto` & projector (posts + comments)
- **Scope:** D7, D9, D12. `PostDto` exactly §4.2 for BOTH kinds; `PostProjector` (Application, batch) projects `Post` & `Comment` lists: authors by ids, viewer likes & saves by target ids per kind, direct-children counts filtered by §4.4; repo additions `ILikeRepository.GetLikedTargetIdsAsync(userId, targetIds, type)`, `ISavedItemRepository.GetSavedTargetIdsAsync(userId, targetIds, type)`; direct-child queries are 2 separate strongly-typed members (no id-kind guessing): `ICommentRepository.GetTopLevelCommentsByPostIdsAsync(IReadOnlyCollection<PostId>)` (`PostId` in set & `ParentCommentId == null` & not deleted) & `GetChildCommentsByParentIdsAsync(IReadOnlyCollection<CommentId>)` (`ParentCommentId` in set & not deleted); both return `(parentKey, commentId, authorId)` rows, projector filters by §4.4 then counts; apply to `GET /api/posts/{id}` (hidden/blocked/deleted -> 404), `POST /api/posts` (201 + `Location: /api/posts/{id}`), `PUT /api/posts/{id}` (200); delete `PostInfo` & placeholder `AuthorName`
- **Depends:** T2.1, T1.6, T1.9
- **Files:** `Application/Models/PostDto.cs`, `Application/Features/Posts/Projection/` (new), `GetPost/`, `CreatePost/`, `UpdatePost/`, Domain repo contracts, mock repos, `PostsController.cs`
- **Tests:** `GetPost_AuthorSnapshot` | `GetPost_ViewerFlags_AfterLikeAndBookmark` | `GetPost_Anonymous_FlagsFalse` | `GetPost_CommentsCount_DirectVisibleOnly` (excludes deleted, nested & blocked-author replies) | `CommentCount_PostIdAndCommentIdQueriesNeverMix` (unit: top-level query ignores replies, child query ignores top-level) | `GetPost_PrivateAuthorNonFollower_404` | `GetPost_BlockedEitherWay_404` | `CreatePost_201_PostDtoKindPost_Location` | `UpdatePost_200_IsEditedTrue` | `Projector_Comment_KindCommentParentIdPostId` (unit) | `Projector_FixedRepoCallsPerPage` (unit)
- **DoD:** no endpoint returns `PostInfo`; T2.5 needs no DTO change

#### - [x] T2.4 Paged lists: user posts & saved posts
- **Scope:** D15, D16. `PagedResponse<T>`; `GET /api/posts/user/{userId}` -> `UserPostsPageDto`: blocked either way / deleted -> 404 (D14); private non-accepted -> `locked: true`, empty items, `totalCount 0`; else root posts filtered BEFORE paging; `GET /api/saveditems/posts?page&pageSize` newest saved first, inaccessible posts (§4.4: deleted, author blocked/deleted, privacy/visibility revoked since saving) excluded BEFORE paging & `totalCount`, `PostDto` (kind post)
- **Depends:** T2.3, T1.2
- **Files:** `Application/Models/Commons/PagedResponse.cs`, `Features/Posts/GetPostsByUserId/`, `Features/SavedItems/GetSavedPosts/`, `ISavedItemRepository` (paged), `PostsController.cs` (list action only), `SavedItemsController.cs`
- **Tests:** `UserPosts_PrivateNonFollower_LockedEmpty` | `UserPosts_Owner_SeesAll` | `UserPosts_BlockedEitherWay_404` | `UserPosts_TotalCountAfterFilter` | `UserPosts_BeyondLastPage_EmptyWithMetadata` | `SavedPosts_Paged_NewestSavedFirst` | `SavedPosts_ExcludesDeletedHiddenBlocked_BeforePaging` | `SavedPosts_AuthorWentPrivate_NonFollower_Excluded`
- **DoD:** FE `fetchUserPosts(.., "threads", page)` & `fetchSavedPosts(page)` map 1:1 (`nextPage = hasNextPage ? page + 1 : undefined`)

#### - [x] T2.5 Thread read & comment writes
- **Scope:** D12, D13. `GET /api/threads/{id}` -> `ThreadDto` (§4.2) via `PostProjector`; requested item inaccessible (§4.4) -> 404; `parent` included only if accessible, else `null`; replies & `childReplies` (1 level) filtered by §4.4, newest first; id resolution: try `PostId` then `CommentId` (typed lookups); AddComment: parent unknown/soft-deleted/inaccessible -> `404 NotFound`, parent on other post -> `400 ParentCommentMismatch` (`ParentCommentMustBelongToPostRule`); `POST /api/comments` -> 201 `PostDto` (`Location: /api/threads/{id}`); `PUT /api/comments/{id}` -> 200 `PostDto`
- **Depends:** T2.3, T1.10 (comment like flags via new routes in tests)
- **Files:** `Features/Threads/GetThread/` (new), `Features/Comments/{AddComment,UpdateComment}/`, `ICommentRepository` (`GetChildrenAsync(parentIds)`), `Domain/Comments/Rules/` (new rule), `ThreadsController.cs` (new), `CommentsController.cs`
- **Tests:** `Thread_ByPostId_RepliesNewestFirst` | `Thread_ByCommentId_ParentIsParentComment` | `Thread_ByTopLevelCommentId_ParentIsRootPost` | `Thread_ExcludesDeletedAndBlockedReplies` | `Thread_ReplyCommentsCount_MatchesChildReplies` | `Thread_HiddenRoot_404` | `Thread_CommentUnderBlockedAuthorParent_ParentNull` | `Thread_HiddenRepliesNotCounted` | `AddComment_ParentFromOtherPost_400_ParentCommentMismatch` | `AddComment_ParentSoftDeleted_404_NotFound` | `AddComment_ParentUnknown_404` | `AddComment_201_PostDtoKindComment` | `UpdateComment_200_PostDto`
- **DoD:** FE `fetchPostThread(id)` & `createReply` map 1:1; `/posts/[replyId]` resolvable

#### - [x] T2.6 Contract snapshot & verification
- **Scope:** `[ProducesResponseType]` with real DTOs + `ProblemDetails` on all MVP endpoints; regenerate `ysocial-clients/web-app/docs/swagger.json` (copy only); verify generated schemas against §4.2 & integration responses
- **Depends:** T2.2, T2.3, T2.4, T2.5 (ALL complete)
- **Files:** controllers, `Program.cs` (Swagger), FE `docs/swagger.json`, `tests/.../Contract/SwaggerTests.cs`
- **Tests:** `Swagger_Builds` | `Swagger_MvpEndpoints_HaveResponseSchemas` | `Swagger_ErrorResponses_UseProblemDetails`
- **DoD:** MAP §2 rows updated; CP2 may be declared only after this task

#### - [x] T3.1 Privacy toggle & follow requests
- **Scope:** `PUT /api/users/profiles/me/privacy {isPrivate}` -> `{ acceptedCount }`: going public transitions ONLY `Pending` -> `Accepted` (via `AcceptFollow`, events fire per edge), existing accepted followers untouched; `acceptedCount` = number of actual transitions; going private changes no edge (0); same value again -> 0. `GET /api/users/me/follow-requests?page&pageSize&query` -> `FollowListPageDto` (`locked` always false): `page` default 1 (>= 1), `pageSize` default 20, bounds 1..50 (D16), newest request first (edge `UpdatedAt` desc, tie-break requester id), requesters filtered by §4.4 BEFORE paging; `query` per relation-list search rule (below); `GET /api/users/me/follow-requests/count` = same filter, no query; `POST /api/users/{requesterId}/relations/follow-request {decision: accept | decline}` -> 204 (decline = soft-delete edge, no event); accept notifies requester
- **Relation-list search rule (shared with T3.2, T3.4):** `query` optional, trimmed, max 50 chars (> 50 -> 400), empty = no filter; matches `username` OR `displayName`, case-insensitive & diacritics-insensitive (`FormD` strip marks, matches FE search) substring; applied after §4.4 filter, before paging
- **Depends:** T2.2, T1.3
- **Files:** `Features/Users/UpdatePrivacy/`, `Features/UserRelations/{GetFollowRequests,RespondFollowRequest}/`, `IUserRelationRepository` (pending by target, paged), `UserRelationsController.cs`, `UsersController.cs`
- **Tests:** `Follow_PrivateTarget_Pending` | `Accept_MakesAccepted_IncrementsCounts` | `Decline_RemovesEdge_NoCountChange` | `GoPublic_AcceptsOnlyPending_CountEqualsTransitions` (2 accepted + 3 pending -> 3) | `GoPublic_Twice_SecondReturns0` | `GoPrivate_KeepsAcceptedFollowers` | `RespondMissingRequest_404` | `Requests_RequireAuth` | `Requests_DefaultPageSize20_NewestFirst` | `Requests_PageSize51_400` | `Requests_Query_MatchesUsernameOrDisplayName_DiacriticsInsensitive` | `Requests_Query51Chars_400` | `Requests_DeletedRequester_ExcludedFromListAndCount`
- **DoD:** FE `setPrivateAccount`, `fetchFollowRequests`, `fetchFollowRequestCount`, `respondFollowRequest` covered; `Pending` reachable via API

#### - [ ] T3.2 Followers/following lists & relation sets
- **Scope:** `GET /api/users/{id}/followers|following?page&pageSize&query` -> `FollowListPageDto` (accepted only, default 20, bounds 1..50, D14 404 if blocked either way, D15 locked, items filtered by §4.4 BEFORE paging, when not locked & no `query`: `totalCount` == profile counts of T2.2; when locked: `totalCount` 0 while profile still shows counts (D15, FE counts visible but not clickable); search rule of T3.1, order newest edge first); items projected by T2.2 `UserProfileProjector`; `GET /api/users/me/relation-sets` -> `RelationSetsDto` (no `blockedBy`); `GET /api/users/me/blocks?page` (D14 exception: `isBlocked: true`)
- **Depends:** T3.1
- **Files:** `Features/UserRelations/{GetFollowList,GetRelationSets}/`, `Features/UserBlocks/GetBlocks/`, repo list members, `UserRelationsController.cs`, `UserBlocksController.cs`
- **Tests:** `Followers_ExcludesPendingAndBlockedUsers` | `Followers_PrivateLocked` | `Followers_TargetBlockedViewer_404` | `Following_QueryFilter` | `RelationSets_IncludesDormantCloseFriend` | `RelationSets_NoBlockedBy` | `MyBlocks_ListsBlockedUsers_IsBlockedTrue`
- **DoD:** FE `fetchFollowList`, `fetchRelationSets`, `fetchBlockedUsers`, `fetchCloseFriendCandidates` covered

#### - [ ] T3.3 Interaction enforcement on writes
- **Scope:** D14. like/bookmark/comment/reply require `CanViewPost` on target's root post (else 404); block either way on author -> 404; block target existence checked (404); close-friend & follow paths already coded in T1.1b
- **Depends:** T2.1, T2.5, T1.10
- **Files:** `Features/Likes/*`, `Features/SavedItems/*`, `Features/Comments/AddComment/`, `Domain/Comments/Services/CommentPostingService.cs`, `Features/UserBlocks/Block/`
- **Tests:** `Like_PrivatePostNonFollower_404` | `Comment_BlockedEitherWay_404` | `Bookmark_BlockedAuthor_404` | `BlockMissingUser_404` | regression `Like_OwnContent_Allowed`
- **DoD:** MAP §4.7 risk closed for writes

#### - [ ] T3.4 Mute set endpoint (optional)
- **Scope:** `PUT`/`DELETE /api/users/{targetId}/relations/mute` (idempotent, no body); `GET /api/users/me/mutes?page`; mute without follow edge: decide in task (create `None` edge vs require relation)
- **Depends:** T3.2
- **Files:** `Features/UserRelations/{SetMute,GetMutes}/` (new), `Domain/UserRelations/UserRelation.cs` (if needed), `UserRelationsController.cs`
- **Tests:** `PutMute_Twice_Idempotent` | `DeleteMute_NotMuted_204` | `Mutes_Paged` | `Profile_IsMutedTrue`
- **DoD:** FE `setMuted`, `fetchMutedUsers` covered

#### - [ ] T4.1 Feed (optional, recommended next)
- **Scope:** `GET /api/feed?tab=following|forYou&page` (following = accepted followees + self root posts; forYou = all viewable root posts); policy before paging; muted excluded when T3.4 done; offset vs cursor decided here (D16 alt)
- **Depends:** T2.4 (T3.4 for mute exclusion)
- **Files:** `Features/Feed/GetFeed/` (new), `IPostRepository` (by authors, paged), `FeedController.cs` (new)
- **Tests:** `Feed_Following_OnlyAcceptedAndSelf` | `Feed_ForYou_ExcludesHiddenBlocked` | `Feed_NewestFirst_Paged`
- **DoD:** FE `fetchFeed(tab, page)` covered

#### - [ ] T4.2 Notifications (optional)
- **Scope:** HTTP list/unread count/mark read (`MarkNotificationAsRead` -> `Result`, `403 NotNotificationRecipient`); SignalR payload aligned to FE (`createdAt, isRead, senderName, senderAvatar, targetId`, type `NewFollow`); skip self-notifications; outbox removes processed messages
- **Depends:** T1.3, T2.2
- **Files:** `Features/Notifications/*`, `NotificationsController.cs` (new), `Infrastructure/Notifications/*`, `Domain/Notifications/Notification.cs`
- **Tests:** `Notifications_List_NewestFirst_Paged` | `MarkRead_OtherRecipient_403` | `SelfLike_NoNotification` | `Outbox_ProcessedMessageRemoved`
- **DoD:** FE `/notifications` list & realtime payload render without blanks

#### - [ ] T4.3 Security hardening (required before any shared deployment)
- **Scope:** redaction of passwords, OTP, access & refresh tokens, reset tokens in BOTH `LoggingBehavior` (request & response objects) & `MockEmailSender`/`MockSmsSender` logs (OTP never logged outside Development, masked in Development); JWT secret required outside Development (no fallback); seed + admin-token logging Development-only
- **Depends:** T1.5 (JWT config shape)
- **Files:** `Application/CQRS/Behaviors/Logging/*`, `Infrastructure/*/Mock*Sender.cs`, `Infrastructure/Identity/JwtProvider.cs`, `Program.cs`, `MockDataStore.cs`
- **Tests:** `Login_PipelineLogs_NoPasswordOrTokens` (captured logger) | `RefreshToken_PipelineLogs_NoTokens` | `ForgotPassword_SenderLogs_NoOtp` | `ResetPassword_PipelineLogs_NoOtpOrPassword` | `Production_MissingJwtSecret_FailsStartup`
- **DoD:** BG §10.7, §10.8, §10.13 resolved

## 6. FE integration checkpoints

FE work is out of scope; CP = BE contract frozen for slice + test evidence

| CP | Requires | FE slice unblocked | Verify (BE side) |
|---|---|---|---|
| CP0 | T1.1a, T1.1b, T1.7 | FE plumbing: base URL, ProblemDetails normalizer (`code` switch), JWT `user_id` decoder, login redirect `/login` | `https://localhost:49895/swagger` up; preflight from `localhost:3000`; error-contract tests green |
| CP1 | CP0 + T1.2-T1.9 | auth (login, register with username, forgot/reset, logout, silent refresh), post delete | integration suite green; manual login -> refresh -> logout |
| CP2 | CP1 + T1.10, T2.1-T2.6 ALL complete | profile header & edit, switcher (`/api/users/me`), post create/edit, post detail + thread, profile threads tab, saved page, like/bookmark | Swagger regenerated & verified (T2.6); MAP updated |
| CP3 | CP2 + T3.1-T3.3 | private account, follow requests, followers dialog, block list, close friends | relation suite green; T2.6 snapshot re-run |
| CP4 | T4.x | feed, notifications | per task |

- FE never consumes a slice before its CP; mocks stay for everything else

### FE follow-ups (record in FE roadmap at CP; not done here)
- **CP1 (required):** cross-tab refresh single-flight (`navigator.locks` or BroadcastChannel) + after acquiring lock re-read stored refresh token & skip refresh if already rotated; fix refresh-failure redirect `/auth/login` -> `/login`; register sends `username`
- **CP2:** viewer bootstrap from `MeDto` (`profile`, `email`, `profiles`), never expect `email` on other profiles; follow status from `{followStatus}`; like/bookmark via `PUT`/`DELETE` resource routes; thread via `/api/threads/{id}`; reply like/bookmark route by `kind`; map `visibility` `followersOnly|private` (not produced in MVP)
- **CP2/CP3 (D14):** blocked profile becomes not-found; drop `isBlockedBy` usage & `RelationSets.blockedBy`; "blocked by" UI state removed; unblock only from own block list

## 7. Docs to update when contracts change

Single owner per fact; others link, never copy

| Fact | Owner doc | Trigger |
|---|---|---|
| Pipeline, error pipeline, auth lifecycle, dispatch semantics & concurrency, debt list | `backend/architecture/backend-guide.md` (§3, §5, §6, §7, §10, §12) | T1.1a/b, T1.3, T1.4, T1.5, T4.3 |
| Rules (+ code/kind), events Live?, state machines, repo contracts | `backend/architecture/domain-model.md` (§4-§7) | T1.1b, T1.3, T1.4, T1.8, T2.5, T3.1 |
| Endpoint matrix, statuses, published error-code list, DTO shapes, FE ground truth (incl. refresh cross-tab) | `backend/integration/frontend-backend-mapping.md` (§1, §2, §3, §7 decided D-ids) | every task touching an endpoint |
| Decision status & task progress | this plan (§4, §5.4 checkboxes); §4.1/§4.2 frozen once MAP holds them (replace by link) | each task close |
| Generic patterns (classified rules, projector, access policy, set-based repo members) | `conventions/backend.md` | T1.1b, T2.1, T2.3 |
| Stale specs | `features/identities.md`, `features/user-profile-and-relations.md` -> replace endpoint content with MAP link | T1.5, T3.1 |
| Test layers | `features/backend-unit-test.md` (API integration layer, reset rules) | T0.1 |
| Swagger copy for FE | `ysocial-clients/web-app/docs/swagger.json` | T2.6 & every later contract change |

## 8. Deferred work & known risks

### Deferred (not integration blockers)
- Feed, notifications HTTP + payload alignment, mute (T3.4, T4.x): FE stays on mocks
- Search, tags, trending, suggestions, hashtags/mentions
- Pin, hide-like-count, reposts, polls, drafts, DMs, report
- Media upload & multi-image, close-friends audience (D17), profile tabs `replies` & `media`
- Create-profile, username change, deactivate/activate, change password, session list
- EF Core / PostgreSQL persistence & transactions, outbox persistence, per-scope event tracking
- Access-token revocation list (mitigated by 15 min lifetime, D6)

### Known risks

| Risk | Impact | Mitigation |
|---|---|---|
| **NOT production-ready:** process-global static store, no transactions, no rollback | partial writes on failure; data lost on restart | accepted for FE integration; deferred EF migration |
| Process-global event provider under concurrency | concurrent requests may steal/discard each other's events | T1.3 atomic drain + lock; documented in BG §7.2 |
| Failure after mutation | state changed but events discarded -> counters/side effects skipped | validators run before handlers (T1.1a, T1.6, T1.8); T1.3 logs discarded events |
| Concurrent mutation of shared aggregates (`Account` token list, counters) | races, corrupted lists | 1 per-account session lock for ALL token mutations (§4.3, T1.4/T1.5); process-local only; other aggregates accepted risk |
| Future token-mutating path skips the lock | silent race | §4.3 path list in BG §6.4; review grep `RefreshToken` mutators vs `IAccountSessionLock` usage |
| Stored follow counters drift from edges | wrong counts if exposed | not exposed: profile counts computed on read (§4.2, T2.2); `likesCount` stays stored (accepted, §4.4) |
| New read endpoint forgets policy | indirect disclosure | §4.4 single definition in `IViewerAccessPolicy`; each read task has blocked/deleted/private tests |
| Static state leaks between tests | flaky tests | T0.1 in-place reset inventory + serialized collection |
| `Task.WhenAll` over same repo in existing handlers | breaks on EF `DbContext` | no new occurrences; fix at EF migration |
| BE restart wipes state; FE holds old ids/tokens | 404/401 after restart | deterministic seed (T0.1); FE treats refresh 401 as logout |
| Cross-tab refresh race | all tabs logged out | FE CP1 follow-up (§6); BE serialized rotation |
| Access token valid after logout until expiry | 15 min window | D6 accepted; revocation list deferred |
| Unclassified future rule | generic `BusinessRuleViolated` code | `AllRules_AreClassified` test (T1.1b) |
| Error-code rename | silent FE break | `CodesSnapshot_MatchesApprovedList` (T1.1b); rename = contract change via MAP |
| Comment ids vs post ids in `/posts/[id]` | reply deep links 404 | D13 thread route |
| D14 hides blocked users completely | FE "blocked by"/unblock-on-profile states unusable | FE follow-up (§6); unblock via own block list |
| FE `generated.ts` from stale Swagger | type drift | T2.6 regenerate; integration tests are truth |
| Toggle endpoints kept during transition | FE may call wrong one | remove after CP2 (follow-up task) |
| Credentials/OTP in logs, permissive config | security exposure | T4.3 before shared deployment |
