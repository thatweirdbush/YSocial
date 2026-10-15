---
module: Backend Domain Model
updated: 2026-10-15
---

# DOMAIN MODEL

- Pipeline, dispatch, auth & error semantics: `backend-guide.md`
- FE endpoint view, error codes, DTOs: `../integration/frontend-backend-mapping.md`
- Paths BE-relative (`src/YSocial.Domain/...`)
- **Runtime state (2026-10-15):** every event with a handler is dispatched in the same request (BG §7); column **Live?** in §6 states which ones have an effect

## 1. Identity semantics (critical for FE)

| Id | Meaning | Where it appears |
|---|---|---|
| `AccountId` | login identity (email/phone/password, sessions) | JWT `sub`; `register` response; never a social route id |
| `UserId` | profile (public persona); 1 account has 1..N | JWT `user_id`; author of posts/comments; target of follow/block; every `{userId}`/`{targetId}`/`{id}` user route; viewer identity of every read |
| `PostId`, `CommentId`, `LikeId`, `SavedItemId`, `NotificationId`, `UserRelationId`, `UserBlockId`, `RefreshTokenId` | aggregate/entity ids | DTOs expose raw `Guid` (`PostDto.id`, `UserProfileDto.id`) |

- All are strongly-typed Guid
- Social graph, content & notifications are **per profile (`UserId`)**, not per account; switching profile changes actor
- Username belongs to `User`, chosen at register (format `^[a-z0-9._]{3,30}$`), unique case-insensitive INCLUDING soft-deleted profiles (never recycled); emails also stay reserved after soft-delete; not editable (`UpdateProfileCommand` has no username)
- Source: `Domain/Identities/Account.cs`, `Domain/Users/User.cs`, `Infrastructure/Identity/JwtProvider.cs`

## 2. Aggregates & boundaries

| Aggregate root | Children / value objects | Soft-delete | Repo contract | Notes |
|---|---|---|---|---|
| `Account` | `RefreshToken` (entity, `RefreshTokenId`; bound to `UserId`, `ReplacedByTokenId`), `PasswordResetToken` (entity, Guid), `PasswordHash` (VO), `UserRole` | yes | `IAccountRepository` | tokens live inside aggregate (copy-on-write list); `Email` unique via `IUserRepository.IsEmailUniqueAsync` (includes deleted) |
| `User` (profile) | `UserProfileInfo` (VO), `PrivacySettings` (VO), `Country` (enumeration), counters | yes | `IUserRepository` | `Address` VO exists, unused by `User`; stored `FollowersCount`/`FollowingCount` kept by events but NOT exposed (profile counts computed on read) |
| `Post` | - | yes | `IPostRepository` | `Visibility`, `AllowComments`, `LikeCount`, `SavedCount`; no comment counter (`commentsCount` computed on read) |
| `Comment` | - | yes | `ICommentRepository` | nested via `ParentCommentId`; counts inline |
| `Like` | - | no | `ILikeRepository` | polymorphic target (`LikeTargetType` Post/Comment) |
| `SavedItem` | - | yes | `ISavedItemRepository` | polymorphic target (`SavedItemTargetType`) |
| `UserRelation` | - | yes | `IUserRelationRepository` | directed edge observer -> target; also carries the observer's `IsCloseFriend` & `IsMuted` (+ `MutedAt`) flags, so a `None` edge can exist only to hold a mute |
| `UserBlock` | - | no | `IUserBlockRepository` | standalone, directed |
| `Notification` | - | no | `INotificationRepository` | `TargetId` (Guid?, post/comment/follower id for FE navigation), `IsRead`/`ReadAt`; types `FollowRequested`, `FollowAccepted`, `NewComment`, `NewLike`, `NewFollow` |

- Cross-aggregate links are by id only (no navigation): comment -> `PostId`, `UserId`; relation -> `UserId` x2
- Domain services (transient, stateless): `UserRelationManager` (follow/unfollow/block/unblock/close-friend; uses 3 repos), `CommentPostingService`, `LikeToggleService`, `SavedItemToggleService`, `UserProfileService`
- **Soft-delete contract:** domain method sets `IsDeleted`; mock `Remove()` merely re-stores entity; `GetByIdAsync(id)` hides deleted, `GetByIdAsync(id, includeDeleted: true)` returns them
- **Shared-kernel contract (`BB:Domain/Repositories/IRepository.cs`):** `IRepository<T,TId>` = `UnitOfWork`, `GetByIdAsync(id[, includeDeleted], ct)`, `AddAsync`, `Update`, `Remove`, `T : IAggregateRoot`
- **Base types (`BB:Domain`):** `Entity<TId>` equality by id (transient entities never equal), `ISoftDeletable` = `IsDeleted` + `DeletedAt` (+ `WhereNotDeleted`), `ValueObject`/`Enumeration<T>` are records (value equality)
- Kernel `EntityMustBeDeletedToRestoreRule` is NOT used: it cannot implement `IClassifiedRule`; replaced by `PostMustBeDeletedToRestoreRule` & `CommentMustBeDeletedToRestoreRule`

## 3. Enumerations (request bodies: integers; read DTOs: strings)

| Type | Values | Exposed in API? |
|---|---|---|
| `FollowStatus` | None 0, Pending 1, Accepted 2 | read DTOs & follow response: lowercase `none`/`pending`/`accepted` (`followStatus`) |
| `PostVisibility` | Public 1, FollowersOnly 2, Private 3 | `PostDto.visibility` = `public`/`followersOnly`/`private`; no input (always Public) |
| `LikeTargetType` / `SavedItemTargetType` | Post 1, Comment 2 | toggle request bodies only (int); idempotent routes encode the kind in the path |
| `LikeStatus` / `SavedItemStatus` | Liked 1, Unliked 0 / Saved 1, Unsaved 2 | internal; toggle response: `isLiked`/`isSaved` bool |
| `Gender` | Unspecified 0, Male 1, Female 2, Other 3 | `UpdateProfileRequest` (int) |
| `ProfileType` | Personal 1, Business 2, Creator 3 | preserved on update, not settable |
| `NotificationType` | FollowRequested 1, FollowAccepted 2, NewComment 3, NewLike 4 | SignalR payload `Type` = name string |
| `UserRole` | Member 1, Moderator 2, Admin 3 | no (not in JWT; unused) |
| `Country` | named list; only `Country.Vietnam` used (register default) | no |
| `RuleViolationKind` | Invalid, Forbidden, NotFound, Conflict, Unauthorized | maps to 400/403/404/409/401 (§4) |

- Source: `Domain/*/*.cs`; JSON converter `Api/Infrastructure/Serialization/EnumerationJsonConverterFactory.cs` (ints in/out; strings rejected)
- `RuleViolationKind.Unauthorized` was added beyond the plan's 4 kinds: `InvalidCredentials`/`InvalidRefreshToken` rules must map to 401 (D3, D5)

## 4. Invariants & business rules (limits are code constants)

> Every rule is `internal sealed record ... : IClassifiedRule` (`Message`, `BrokenWhen`, explicit `Code` & `Kind`; `Domain/Common/Rules/`). `Code` comes from `Domain/Common/Errors/ErrorCodes.cs`; `AllRules_AreClassified` & `AllRuleCodes_ExistInCatalog` (reflection) forbid unclassified rules. Published code list: MAP §1

| Area | Rule | Rule class(es) | Code | Kind |
|---|---|---|---|---|
| Post | content non-empty, <= 2000 chars | `PostContentMustNotBeEmptyRule`, `PostContentLengthLimitRule` | `PostContentInvalid` | Invalid |
| Post | only author edits/deletes/restores | `OnlyAuthorCanPerformActionOnPostRule` | `NotPostAuthor` | Forbidden |
| Post | restore only when deleted | `PostMustBeDeletedToRestoreRule` | `PostNotDeleted` | Invalid |
| Comment | content non-empty, <= 1000 chars | `CommentContentMustNotBeEmptyRule`, `CommentContentLengthLimitRule` | `CommentContentInvalid` | Invalid |
| Comment | post must allow comments | `PostMustAllowCommentsRule` | `CommentsDisabled` | Invalid |
| Comment | parent must belong to same post (nesting depth unbounded) | `ParentCommentMustBelongToPostRule` | `ParentCommentMismatch` | Invalid |
| Comment | edit: author only | `OnlyAuthorCanEditCommentRule` | `NotCommentAuthor` | Forbidden |
| Comment | delete: author or post owner | `OnlyAuthorOrPostOwnerCanDeleteCommentRule` | `NotCommentAuthorOrPostOwner` | Forbidden |
| Comment | restore: only the deleter | `OnlyDeleterCanRestoreCommentRule` | `NotCommentDeleter` | Forbidden |
| Comment | restore only when deleted | `CommentMustBeDeletedToRestoreRule` | `CommentNotDeleted` | Invalid |
| Comment | restore: post must not be deleted | `CannotRestoreCommentIfPostIsDeletedRule` | `PostDeleted` | Invalid |
| Account | email contains `@`; phone regex if provided | `EmailMustBeValidRule`, `PhoneNumberMustBeValidRule` | `ValidationFailed` (no `errors` map) | Invalid |
| Account | password min 6, username format (handler pre-checks) | `RegisterAccountCommandValidator` (FluentValidation, not a rule) | `ValidationFailed` + `errors` | - |
| Account | must be active to login (checked AFTER the password) | `AccountMustBeActiveRule` | `AccountInactive` | Forbidden |
| Account | credentials rejected | no rule: login returns `Result.Unauthorized` (`InvalidCredentialsRule` removed) | `InvalidCredentials` | - |
| Account | password hash non-empty | `PasswordHashMustNotBeEmptyRule` | `BusinessRuleViolated` | Invalid |
| Session | refresh token value non-empty, not expired at creation, active when rotated | `RefreshTokenValueNotEmptyRule`, `RefreshTokenMustNotBeExpiredRule`, `RefreshTokenMustBeActiveRule` | `InvalidRefreshToken` | Unauthorized |
| Session | max 5 active refresh tokens | NO rule: `Account.AddRefreshToken` evicts the oldest (`DeviceSessionLimitRule` removed) | - | - |
| Reset OTP | 6 digits, 15 min, 1 active token (latest unexpired unused) | `PasswordResetTokenMustBeValidRule`, `InvalidOtpRule` (wrong OTP) | `InvalidOtp` | Invalid |
| Reset OTP | 5 failed attempts max | `MaximumOtpAttemptsExceededRule` | `OtpAttemptsExceeded` | Invalid |
| Profile | display name non-empty, <= 50, forbidden word list (`NoSensitiveWordsRule`); bio <= 200; DOB in the past; username >= 3 chars | `DisplayNameMustNotBeEmptyRule`, `DisplayNameLengthRule`, `NoSensitiveWordsRule`, `BioLengthRule`, `DateOfBirthMustBeInPastRule`, `UsernameMustBeMinimumLengthRule` | `ProfileFieldInvalid` | Invalid |
| Profile | account keeps >= 1 profile; `SetDefault` needs >= 2 profiles | `AccountMustHaveAtLeastOneProfileRule` | `AccountRequiresProfile` | Invalid |
| Profile | cannot delete default profile | `CannotDeleteDefaultUserRule` | `CannotDeleteDefaultProfile` | Invalid |
| Profile | profile must belong to account | `UserMustBelongToAccountRule` | `ProfileNotOwned` | Forbidden |
| Follow | not self | `CannotFollowYourselfRule` | `CannotFollowSelf` | Invalid |
| Mute | not self (target existence & discoverability checked in handler -> 404) | `CannotMuteYourselfRule` | `CannotMuteSelf` | Invalid |
| Follow | target not deleted (missing target = `EntityNotFoundException`) | `CannotInteractWithDeletedUserRule` | `NotFound` | NotFound |
| Follow | neither side blocked the other | `CannotFollowBlockedUserRule`, `TargetMustNotHaveBlockedObserverRule` | `NotFound` | NotFound |
| Close friend | only while follow is Accepted | `CloseFriendRequiresAcceptedFollowRule` (replaced the string throw) | `CloseFriendRequiresAcceptedFollow` | Invalid |
| Block | not self (target existence checked in handler -> 404) | `CannotBlockYourselfRule` | `CannotBlockSelf` | Invalid |
| Notification | content non-empty; only recipient reads | `NotificationContentMustNotBeEmptyRule`, `OnlyRecipientCanReadNotificationRule` | `NotificationContentInvalid`, `NotNotificationRecipient` | Invalid, Forbidden |
| Notification | not to yourself (enforced in `Notification.Create`; `NotificationPublisher` skips self events first) | `CannotSendNotificationToYourselfRule` | `BusinessRuleViolated` | Invalid |
| Likes | ids non-empty | `PostIdMustNotBeEmptyRule`, `UserIdMustNotBeEmptyRule` | `ValidationFailed` | Invalid |
| Country | ISO code & name checks (5 rules) | `CountryISO*`, `CountryNameMustNotBeEmpty` | `BusinessRuleViolated` | Invalid |

- Failure -> HTTP: via `Kind` (BG §5.2), never 500; hidden-entity rules (`Kind = NotFound`) answer a generic detail
- Rule classes are renameable without contract change (codes are independent of class names)
- `Source:` `Domain/*/Rules/*.cs`, `Domain/UserRelations/Services/UserRelationManager.cs`

## 5. State transitions

### 5.1 `UserRelation` (follow edge) - `UserRelation.cs`, `UserRelationManager.cs`, tests
```
(none) --Follow, target public--> Accepted   [UserFollowAcceptedEvent]
(none) --Follow, target private-> Pending    [UserFollowRequestedEvent]
Pending|Accepted --Follow--> unchanged (idempotent, returns current status)
Pending --Unfollow--> soft-deleted (no event)  == cancel request
Accepted --Unfollow--> soft-deleted [UserUnfollowedEvent]
soft-deleted --Follow--> restored, status re-evaluated vs target privacy NOW
Pending --accept (respond follow-request | target goes public)--> Accepted [UserFollowAcceptedEvent, FromRequest = true]
Pending --decline (respond follow-request)--> soft-deleted (no event, no count change)
```
- `IsCloseFriend` survives unfollow/refollow & persists dormant while status is not Accepted (effective only when Accepted; flag stays set after refollow lands in Pending); `RelationSetsDto.closeFriends` includes dormant flags of discoverable users
- **Mute:** `SetMuted(bool)` is idempotent, sets `MutedAt`, NEVER touches `FollowStatus`, `IsDeleted` or `UpdatedAt` (follow lists order by `UpdatedAt`); no edge -> a `None` edge is created (invisible to counts, lists & follow state: `GetAcceptedEdgesAsync`/`GetPendingRequestsAsync` filter by status); a soft-deleted edge stays deleted and keeps the flag dormant; a later follow restores the edge with the mute intact; unmute needs no target checks
- `Unfollow` of non-existent edge = silent success (idempotent)
- **Privacy toggle:** `PUT users/profiles/me/privacy`: going public transitions ONLY `Pending` -> `Accepted` (events per edge; `acceptedCount` = transitions), accepted followers untouched; going private changes no edge; same value again -> 0
- **Counters:** stored `FollowersCount`/`FollowingCount` updated by `UpdateFollowCountsHandler` on Accepted/Unfollowed events (live) but not exposed; profile `followersCount`/`followingCount` = accepted edges whose other party is discoverable to the viewer, computed on read (equal to the follow-list `totalCount`)
- **Accept notification:** `UserFollowAcceptedEvent.FromRequest` true -> the REQUESTER is notified; plain follow of a public user -> the followed user is notified

### 5.2 Block
- `Block`: idempotent (existing block returned); target must exist & not be deleted (404; self -> 400 `CannotBlockSelf`); creates `UserBlock` + `UserBlockedEvent`; `RemoveFollowsWhenUserBlockedEventHandler` (live) soft-deletes follow edges in BOTH directions in the same request; previously removed follows are not restored on unblock
- Follow attempts are rejected in both directions with `404 NotFound` (D14, no distinction)
- `Unblock`: hard removes row, idempotent when absent; `UserUnblockedEvent` dispatches (no-op handler)
- **Enforced everywhere (D14):** blocked either way = 404 for profile reads, user posts, follow lists of that user, post/thread reads, follow, like, bookmark & comment writes; ONLY exception = viewer's own block list (`GET users/me/blocks`, `isBlocked: true`); `isBlockedBy` is always false (any such read is 404)
- Single definition: `IViewerAccessPolicy` (reads) & `InteractionGuard` (writes), see conventions/backend.md

### 5.3 Post
- `Create` (Public, AllowComments true, no input for either; text-only allowed, optional single `imageUrl`) -> `PostCreatedEvent` (log-only handler)
- `UpdateContent` (author; text only; `ImageUrl` immutable) -> `PostUpdatedEvent` (no handler); non-author who cannot see the post gets 404, who can see it gets 403
- `Delete` (author) -> soft; hidden from every read; `PostDeletedEvent` -> saved items soft-removed in the same request; comments & likes untouched
- `Restore` (author, deleted) -> `PostRestoredEvent` (no handler); not-deleted -> 400 `PostNotDeleted`; saved items are not restored
- Delete already-deleted post -> `GetByIdAsync` hides it -> 404 (not idempotent)
- `UpdateSettings(visibility, allowComments)` exists, **no use case**
- **Read accessibility:** author discoverable & content visible & `Visibility` allows & not deleted (`IViewerAccessPolicy`, plan §4.4)

### 5.4 Comment
- `Create` (post exists, accessible & not deleted; parent unknown/deleted/inaccessible -> 404, parent of another post -> 400 `ParentCommentMismatch`) -> `CommentCreatedEvent` -> notification to **post author** (self-comment notifies self)
- `UpdateContent` (author) | `Delete` (author or post owner; soft; `DeletedBy` recorded; `CommentDeletedEvent` -> saved items soft-removed) | `Restore` (deleter only, post alive)
- Replies are comments with `ParentCommentId` (unbounded nesting); read via `GET /api/threads/{id}` (post OR comment id; 1 level of `childReplies`); `commentsCount` = direct accessible children
- **Accessibility:** root post accessible & author discoverable & not deleted

### 5.5 Like / SavedItem
- **Idempotent set** (`SetLike`, `SetSavedItem`; PUT/DELETE routes): target must exist & pass `InteractionGuard` (else 404); no-op when already in state
- **Toggle** (`ToggleLike`, `ToggleSavedItem`; kept until FE CP2, same guard): existing like => hard remove, else create; response `{ isLiked }`/`{ isSaved }`
- `LikeCreated` -> `+1` count & notification to target author (self-like notifies self); `LikeRemoved` -> `-1` (live since the removed-events queue)
- Likes/saves of own content are allowed (even when private); a like on a target that became inaccessible can no longer be removed by the actor via the route (404)
- Saved: existing active => soft-remove (`SavedItemRemovedEvent` -> `-1`), else **new** row (soft-deleted row is never reused); posts & comments can be saved, **only posts are listable** (`GET /api/saveditems/posts`, paged, newest saved first, inaccessible posts excluded BEFORE paging & counting)

### 5.6 Account / Profile
- `Register` -> uniqueness checks (email, username) -> `Account.Create` + `AccountCreatedEvent(username)` -> first profile created (default)
- `Login` -> verify password -> `EnsureCanLogin` -> `AddRefreshToken(deviceId, userId)` (evicts the oldest at 5)
- `Refresh` -> rotate (old revoked, `ReplacedByTokenId`), same profile; `Logout` -> revoke token (+ active successors)
- `SwitchProfile(profileId, refreshToken)` -> rotates refresh token bound to the chosen profile, issues new JWT (profile must belong to JWT's account, else 403)
- `DeleteProfile` soft-deletes non-default profile; `DeleteAccount` soft-deletes account & (via event) every profile; posts/relations/comments remain but are hidden (D20)
- No create-profile use case; `ProfileType`/username immutable via API; privacy via the dedicated endpoint

## 6. Domain events

| Event | Raised by | Handlers | Live? |
|---|---|---|---|
| `AccountCreatedEvent` | `Account.Create` | `InitializeUserProfileHandler` | yes |
| `AccountDeletedEvent` | `Account.Delete` | `RemoveUserWhenAccountDeletedEventHandler` | yes |
| `AccountDeactivatedEvent` | `Account.Deactivate` (unreachable) | - | no |
| `PasswordResetTokenGeneratedEvent` | `Account.GeneratePasswordResetToken` | email/SMS mock senders (no body logged outside Development, digit runs masked in Development) | yes |
| `UserProfileCreatedEvent` | `User.Create` | - | yes (no handler) |
| `PostCreatedEvent` | `Post.Create` | `InitializePostStatsHandler` (log) | yes |
| `PostUpdatedEvent`, `PostRestoredEvent` | Post | - | yes (no handler) |
| `PostDeletedEvent` | `Post.Delete` | `RemoveSavedItemsWhenPostDeletedEventHandler` | yes |
| `CommentCreatedEvent` | `Comment.Create` | `CreateNotificationWhenCommentCreatedHandler` | yes |
| `CommentDeletedEvent` | `Comment.Delete` | `RemoveSavedItemsWhenCommentDeletedEventHandler` | yes |
| `CommentUpdatedEvent`, `CommentRestoredEvent` | Comment | - | yes (no handler) |
| `LikeCreatedEvent` | `Like.Create` | `UpdateLikeCount...`, `CreateNotificationWhenLikedHandler` | yes |
| `LikeRemovedEvent` | `Like.Remove` | `UpdateLikeCount...` | yes |
| `SavedItemCreatedEvent` / `SavedItemRemovedEvent` | SavedItem | `UpdateSavedCount...` | yes |
| `UserFollowRequestedEvent` | `UserRelation.RequestFollow` | `CreateNotificationWhenFollowRequested...` | yes |
| `UserFollowAcceptedEvent` | `RequestFollow`, `AcceptFollow` (`FromRequest`) | `CreateNotificationWhenFollowAccepted...`, `UpdateFollowCountsHandler` | yes |
| `UserUnfollowedEvent` | `UserRelation.Delete` (Accepted only) | `UpdateFollowCountsHandler` | yes |
| `UserBlockedEvent` | `UserBlock.Create` | `RemoveFollowsWhenUserBlockedEventHandler` | yes |
| `UserUnblockedEvent` | `UserBlock.Unblock` | - | yes (no handler) |

- "yes" = dispatched in the same request (all 9 aggregate sets scanned; hard-removed Like/UserBlock/Notification events kept in a removed-events queue; BG §7.2)
- A failed request discards its pending events (nothing dispatched, no leak into later requests)
- Event class hierarchy (`DomainEvent : INotification`)
- Notification semantics: a plain follow of a public user notifies the followed user (`NewFollow`, "X started following you"); an accepted request notifies the requester (`FollowAccepted`); like and comment notify the content author; self events create nothing

## 7. Repository contracts of interest

> Set-based members accept id collections (EF-friendly, fixed number of calls per page); no `Task.WhenAll` over the same repo in new code

| Contract | Extra members | Notes |
|---|---|---|
| `IPostRepository` | `GetByAuthorIdAsync`, `GetByIdsAsync(ids)` (non-deleted only), `GetByAuthorIdsAsync(authorIds)`, `GetAllAsync()` | user posts & feed handlers filter via access policy, then order & page in memory |
| `IUserRepository` | `IsEmailUniqueAsync` (all accounts incl. deleted), `IsUsernameTakenAsync` (case-insensitive, incl. soft-deleted), `GetByAccountIdAsync`, `GetByIdAndAccountIdAsync`, `GetByUsernameAsync` (case-insensitive, not deleted), `GetUsersByIdsAsync` (incl. deleted flag) | username & email stay reserved |
| `IAccountRepository` | `GetByEmail/Phone/Identifier`, `GetAccountWithProfilesByIdentifierAsync`, `GetByRefreshTokenAsync` (lock-free, any token state) | identifier heuristic in mock (BG §6.4) |
| `IUserRelationRepository` | `GetRelationAsync(observer,target[,includeDeleted])`, `GetRelationsAsync(observer, targetIds)` (incl. soft-deleted, dormant flags), `GetByObserverAsync(observer)` (incl. soft-deleted), `GetAcceptedEdgesAsync(userIds)` (active accepted, both directions), `GetPendingRequestsAsync(target)` (unordered) | callers filter by access policy, order & page |
| `IUserBlockRepository` | `IsBlockedAsync`, `GetBlockAsync`, `GetBlocksBetweenAsync`, `GetByObserverAsync(observer)`, `GetBlockedEitherWayAsync(userId, candidateIds)` (single set query, both directions) | block list = observer's own blocks |
| `ISavedItemRepository` | `GetByUserAndTargetAsync`, `GetSavedTargetIdsAsync(user, targetIds, type)`, `GetSavedItemsByUserAsync` (list, handler pages), `RemoveByTargetAsync` | viewer flags in 1 call per page |
| `ILikeRepository` | `GetByUserAndTargetAsync`, `GetLikedTargetIdsAsync(user, targetIds, type)` | viewer flags in 1 call per page |
| `ICommentRepository` | `GetTopLevelCommentsByPostIdsAsync(postIds)`, `GetChildCommentsByParentIdsAsync(parentIds)` (both return `CommentChildRow(ParentKey, CommentId, AuthorId)`), `GetTopLevelByPostIdAsync(postId)`, `GetChildrenAsync(parentIds)` | typed on purpose: post ids & comment ids never mixed |
| `INotificationRepository` | `GetByRecipientAsync(recipient)` (all, unordered) | `AccessibleNotifications` filters by sender access, orders & pages |

- Unit of Work: `IUnitOfWork` (BuildingBlocks) implemented by `Infrastructure/Persistence/UnitOfWork/UnitOfWork.cs`; mock repos return `UnitOfWork => null!`

## 8. Feature-specific status (follow, soft-delete, privacy, visibility, ownership)

| Topic | Implemented? | Evidence / gap |
|---|---|---|
| Follow / unfollow | yes (state machine §5.1) | `FollowUserCommand` -> `{followStatus}`; unfollow 204 |
| Follow requests (private account) | yes | list, count, respond, privacy toggle (MAP §2.6) |
| Soft-delete & restore (post, comment) | yes | restore permissions differ (post: author; comment: author-or-owner & must be deleter) |
| Soft-delete & restore (follow edge) | yes (restore by re-follow) | `includeDeleted: true` in `FollowUserAsync` |
| Block checks both directions | yes, everywhere (D14) | reads (`IViewerAccessPolicy`) & writes (`InteractionGuard`, `UserRelationManager`) |
| Account privacy | yes | read effect: locked lists, profile still 200 (D15) |
| Post visibility | enforced on reads | field exists, never set (always Public); `followersOnly`/`private` honored if present |
| Ownership checks | writes (rules) & reads (policy) | delete/restore of hidden content answers 404 before the ownership 403 (`InteractionGuard`, BG §6.3) |
| Deleted-user handling | yes (D20) | content of soft-deleted profiles hidden from all reads |
| Mute | yes (§5.1) | PUT/DELETE mute, `me/mutes`, relation sets, feed exclusion |
| Notifications | yes | MAP §2.7, BG §7.4 |

## 9. Open items
- `Post.UpdateSettings` & audience (`CloseFriends`) have no use case (D17): needs a policy query for the author -> viewer edge
- `Account.Deactivate/Activate/AssignRole/ChangePassword` have no use case (account lifecycle: design needed for re-activation)
- Remove at EF migration: stored `FollowersCount`/`FollowingCount` counters (not exposed)
