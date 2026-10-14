---
module: Backend Domain Model
updated: 2026-10-14
---

# DOMAIN MODEL

- Pipeline, dispatch, auth & error semantics: `backend-guide.md`
- FE endpoint view: `../integration/frontend-backend-mapping.md`
- Paths BE-relative (`src/YSocial.Domain/...`)
- **Runtime caveat:** several events below are declared & handled but never dispatched (see backend-guide §7.2); column **Live?** states whether behavior actually runs today

## 1. Identity semantics (critical for FE)

| Id | Meaning | Where it appears |
|---|---|---|
| `AccountId` | login identity (email/phone/password, sessions) | JWT `sub`; `RegisterAccount` response |
| `UserId` | profile (public persona); 1 account has 1..N | JWT `user_id`; author of posts/comments; target of follow/block; every `{userId}`/`{targetId}` route |
| `PostId`, `CommentId`, `LikeId`, `SavedItemId`, `NotificationId`, `UserRelationId`, `UserBlockId`, `RefreshTokenId` |  aggregate/entity ids | DTOs expose raw `Guid` (`PostInfo.Id`) except `CreatePostResponse` & `RegisterAccount` |

- All are strongly-typed Guid
- Social graph, content & notifications are **per profile (`UserId`)**, not per account; switching profile changes actor
- Username belongs to `User`, derived at register from email local part; not unique-checked; not editable (`UpdateProfileCommand` has no username)
- Source: `Domain/Identities/Account.cs`, `Domain/Users/User.cs`, `Infrastructure/Identity/JwtProvider.cs`

## 2. Aggregates & boundaries

| Aggregate root | Children / value objects | Soft-delete | Repo contract | Notes |
|---|---|---|---|---|
| `Account` | `RefreshToken` (entity, `RefreshTokenId`), `PasswordResetToken` (entity, Guid), `PasswordHash` (VO), `UserRole` | yes | `IAccountRepository` | tokens live inside aggregate; `Email` unique via app check only |
| `User` (profile) | `UserProfileInfo` (VO), `PrivacySettings` (VO), `Country` (enumeration), counters | yes | `IUserRepository` | `Address` VO exists, unused by `User` |
| `Post` | none (counts inline) | yes | `IPostRepository` | `Visibility`, `AllowComments`, `LikeCount`, `SavedCount` |
| `Comment` | none | yes | `ICommentRepository` | nested via `ParentCommentId`; counts inline |
| `Like` | none | no (hard remove) | `ILikeRepository` | polymorphic target (`LikeTargetType` Post/Comment) |
| `SavedItem` | none | yes | `ISavedItemRepository` | polymorphic target (`SavedItemTargetType`) |
| `UserRelation` | none | yes | `IUserRelationRepository` | directed edge observer -> target |
| `UserBlock` | none | no (hard remove) | `IUserBlockRepository` | standalone, directed, no soft delete |
| `Notification` | none | no | `INotificationRepository` | `MetaData` is `object?` JSON |

- Cross-aggregate links are by id only (no navigation): comment -> `PostId`, `UserId`; relation -> `UserId` x2
- Domain services (transient, stateless): `UserRelationManager` (follow/unfollow/block/unblock/close-friend; uses 3 repos), `CommentPostingService`, `LikeToggleService`, `SavedItemToggleService`, `UserProfileService`
- **Soft-delete contract:** domain method sets `IsDeleted`; mock `Remove()` merely re-stores entity (Account, User, Post, Comment, SavedItem, UserRelation); `GetByIdAsync(id)` hides deleted, `GetByIdAsync(id, includeDeleted: true)` returns them. Hard removal only for Like, Notification, UserBlock (`Infrastructure/Data/Mock*Repository.cs`)
- **Shared-kernel contract inferred from implementations:** `IRepository<T,TId>` = `GetByIdAsync(id[, includeDeleted], ct)`, `AddAsync`, `Update`, `Remove`, `UnitOfWork`

## 3. Enumerations (serialized as integers in JSON)

| Type | Values | Exposed in API? |
|---|---|---|
| `FollowStatus` | None 0, Pending 1, Accepted 2 | follow response sends **name** string (`"Pending"`/`"Accepted"`) |
| `PostVisibility` | Public 1, FollowersOnly 2, Private 3 | no input, no output (always Public) |
| `LikeTargetType` / `SavedItemTargetType` | Post 1, Comment 2 | request only (int) |
| `LikeStatus` / `SavedItemStatus` | Liked 1, Unliked 0 / Saved 1, Unsaved 2 | internal; response reduces to `isLiked`/`isSaved` bool |
| `Gender` | Unspecified 0, Male 1, Female 2, Other 3 | `UpdateProfileRequest` (int) |
| `ProfileType` | Personal 1, Business 2, Creator 3 | preserved on update, not settable |
| `NotificationType` | FollowRequested 1, FollowAccepted 2, NewComment 3, NewLike 4 | SignalR payload `Type` = name string |
| `UserRole` | Member 1, Moderator 2, Admin 3 | no (not in JWT; unused) |
| `Country` | named list; only `Country.Vietnam` used (register default) | no |

- Source: `Domain/*/*.cs`; JSON converter `Api/Infrastructure/Serialization/EnumerationJsonConverterFactory.cs` (ints in, ints out; strings rejected)

## 4. Invariants & business rules (limits are code constants)

| Area | Rule | Enforced by | Failure -> HTTP |
|---|---|---|---|
| Post | content non-empty, <= 2000 chars | `PostContentMustNotBeEmptyRule`, `PostContentLengthLimitRule` | exception -> 500 |
| Post | only author edits/deletes/restores; restore only when deleted | `OnlyAuthorCanPerformActionOnPostRule`, `EntityMustBeDeletedToRestoreRule` | 500 |
| Comment | content non-empty, <= 1000 | `CommentContent*Rule` | 500 |
| Comment | post must allow comments (always true today) | `PostMustAllowCommentsRule` | 500 |
| Comment | edit: author only; delete/restore: author or post owner; restore: only deleter, post must not be deleted | `OnlyAuthor*`, `OnlyDeleterCanRestoreCommentRule`, `CannotRestoreCommentIfPostIsDeletedRule` | 500 |
| Comment | parent must exist; **not checked** that parent belongs to same post or nesting depth | `AddCommentCommandHandler` | silent acceptance |
| Account | email contains `@`; phone regex if provided; password min 6 (validator) | `EmailMustBeValidRule`, `PhoneNumberMustBeValidRule`, `RegisterAccountCommandValidator` | validator -> 500; rule -> 500 |
| Account | must be active to login (no endpoint can deactivate) | `AccountMustBeActiveRule` | 500 |
| Session | max 5 active refresh tokens | `DeviceSessionLimitRule` | 500 |
| Reset OTP | 6 digits, 15 min, one active token (latest unexpired unused), 5 failed attempts max | `PasswordResetToken*`, `MaximumOtpAttemptsExceededRule` | 500 |
| Profile | display name non-empty, <= 50, no forbidden word list (`badword1`, `badword2`, `sensitive`); bio <= 200; DOB in the past; username >= 3 chars | `User*Rule`, `UpdateProfileCommandValidator` | 500 |
| Profile | account keeps >= 1 profile; default profile cannot be deleted; `SetDefault` needs >= 2 profiles (rule counts `<= 1`) | `AccountMustHaveAtLeastOneProfileRule`, `CannotDeleteDefaultUserRule` | 500 |
| Follow | not self; target exists, not deleted; neither side blocked the other | `CannotFollowYourselfRule`, `CannotInteractWithDeletedUserRule`, `CannotFollowBlockedUserRule`, `TargetMustNotHaveBlockedObserverRule` (generic message) | 500 |
| Close friend | only while follow is Accepted | `UserRelationManager.ToggleCloseFriendAsync` (throws `BusinessRuleValidationException`) | 500 |
| Block | not self; target existence **not** checked | `CannotBlockYourselfRule` | 500 |

- `Source:` `Domain/*/Rules/*.cs`, `Domain/UserRelations/Services/UserRelationManager.cs`; unit-test coverage only for follow/block/close-friend rules (`tests/.../UserRelations`)

## 5. State transitions

### 5.1 `UserRelation` (follow edge) - `UserRelation.cs`, `UserRelationManager.cs`, tests
```
(none) --Follow, target public--> Accepted   [UserFollowAcceptedEvent]
(none) --Follow, target private-> Pending    [UserFollowRequestedEvent]
Pending|Accepted --Follow--> unchanged (idempotent, returns current status)
Pending --Unfollow--> soft-deleted (no event)  == cancel request
Accepted --Unfollow--> soft-deleted [UserUnfollowedEvent]
soft-deleted --Follow--> restored, status re-evaluated vs target privacy NOW
Pending --AcceptFollow--> Accepted   <- NO use case / endpoint (domain + tests only)
```
- `IsCloseFriend` survives unfollow/refollow & persists dormant while status is not Accepted (effective only when Accepted; flag stays set after refollow lands in Pending)
- `IsMuted`: no use case; `ToggleMute` unreachable
- `Unfollow` of non-existent edge = silent success (idempotent)
- Private-account toggle: `User.UpdatePrivacySettings` has no use case -> `IsPrivateProfile` only changeable via seed; so **Pending can never be produced or resolved through API in practice** (all seeded users are public: `PrivacySettings.Default()`)
- Counters `FollowersCount/FollowingCount`: updated only by `UpdateFollowCountsHandler` on Accepted/Unfollowed events -> **never dispatched today** (backend-guide §7.2), so counts stay 0; & they are not exposed by any endpoint anyway

### 5.2 Block
- `Block`: idempotent (existing block returned), creates `UserBlock` + `UserBlockedEvent`; **does not touch relations directly**; auto-unfollow in both directions is event handler (`RemoveFollowsWhenUserBlockedEventHandler`) that **never runs** -> existing follows survive block
- Follow attempts are rejected in both directions (observer-blocked-target message is explicit; target-blocked-observer message is generic by design)
- `Unblock`: hard removes row, idempotent when absent; previously removed follows are not restored
- **Not enforced anywhere else:** no block check on posts, comments, likes, saved, profile reads (`CommentPostingService` has commented "Future extension")
- **Direction/leak:** no endpoint lists blocks or `blockedBy`; FE `isBlockedBy` has no BE source

### 5.3 Post
- `Create` (Public, AllowComments true, no input for either) -> `PostCreatedEvent` (log-only handler)
- `UpdateContent` (text only; `ImageUrl` immutable) -> `PostUpdatedEvent` (no handler)
- `Delete` (author) -> soft; hidden from `GetById`, user list & saved list; `PostDeletedEvent` -> saved items soft-removed; comments & likes are untouched
- `Restore` (author, must be deleted) -> `PostRestoredEvent` (no handler); saved items are not restored
- Delete of already-deleted post -> `GetByIdAsync` hides it -> 404 (not idempotent)
- `UpdateSettings(visibility, allowComments)` exists, **no use case**

### 5.4 Comment
- `Create` (post exists & not deleted) -> `CommentCreatedEvent` -> notification to **post author** (self-comment notifies self)
- `UpdateContent` (author) | `Delete` (author or post owner; soft; `DeletedBy` recorded; `CommentDeletedEvent` -> saved items soft-removed) | `Restore` (deleter only, post alive)
- Replies are comments with `ParentCommentId` (unbounded nesting, same-post not enforced); **no query exists to read comments**

### 5.5 Like / SavedItem
- `ToggleLike`: target must exist (non-deleted) -> existing like => remove (hard), else create; response `{ isLiked }`; `LikeCreated` -> `+1` count & notification to target author (self-like notifies self); `LikeRemoved` -> `-1` **lost** (backend-guide §7.2)
- Likes allowed on own content; blocked/private/visibility state of target is not considered
- `ToggleSavedItem`: existing active => soft-remove (`SavedItemRemovedEvent` -> `-1`), else **new** row (soft-deleted row is never reused); posts & comments can be saved, **only posts are listable** (`GetSavedPosts`: per-item lookup, no pagination, skips deleted posts)
- Both are **toggle (non-idempotent) APIs**: retried request flips state back

### 5.6 Account / Profile
- `Register` -> `Account.Create` + `AccountCreatedEvent` -> first profile created (default, Vietnam, username = email local part)
- `Login` -> verify password -> `AddRefreshToken(deviceId)`
- `SwitchProfile(profileId, refreshToken)` -> rotates refresh token, issues new JWT for chosen profile (profile must belong to JWT's account)
- `DeleteProfile` soft-deletes non-default profile; `DeleteAccount` soft-deletes account & (via event) every profile, **posts/relations/comments remain**
- No create-profile use case; `ProfileType`/privacy/username immutable via API

## 6. Domain events (declared vs live)

| Event | Raised by | Handlers | Live? |
|---|---|---|---|
| `AccountCreatedEvent` | `Account.Create` | `InitializeUserProfileHandler` | yes |
| `AccountDeletedEvent` | `Account.Delete` | `RemoveUserWhenAccountDeletedEventHandler` | yes |
| `AccountDeactivatedEvent` | `Account.Deactivate` (unreachable) | none | no |
| `PasswordResetTokenGeneratedEvent` | `Account.GeneratePasswordResetToken` | email/SMS mock senders (OTP logged) | yes |
| `UserProfileCreatedEvent` | `User.Create` | none | n/a |
| `PostCreatedEvent` | `Post.Create` | `InitializePostStatsHandler` (log) | yes |
| `PostUpdatedEvent`, `PostRestoredEvent` | Post | none | n/a |
| `PostDeletedEvent` | `Post.Delete` | `RemoveSavedItemsWhenPostDeletedEventHandler` | yes |
| `CommentCreatedEvent` | `Comment.Create` | `CreateNotificationWhenCommentCreatedHandler` | yes |
| `CommentDeletedEvent` | `Comment.Delete` | `RemoveSavedItemsWhenCommentDeletedEventHandler` | yes |
| `CommentUpdatedEvent`, `CommentRestoredEvent` | Comment | none | n/a |
| `LikeCreatedEvent` | `Like.Create` | `UpdateLikeCount...`, `CreateNotificationWhenLikedHandler` | yes |
| `LikeRemovedEvent` | `Like.Remove` | `UpdateLikeCount...` | no (lost) |
| `SavedItemCreatedEvent` / `SavedItemRemovedEvent` | SavedItem | `UpdateSavedCount...` | yes |
| `UserFollowRequestedEvent` | `UserRelation.RequestFollow` | `CreateNotificationWhenFollowRequested...`, `UserFollowRequestedEventHandler` (no-op) | no |
| `UserFollowAcceptedEvent` | `RequestFollow`, `AcceptFollow` | `CreateNotificationWhenFollowAccepted...`, `UpdateFollowCountsHandler` | no |
| `UserUnfollowedEvent` | `UserRelation.Delete` (Accepted only) | `UpdateFollowCountsHandler` | no |
| `UserBlockedEvent` | `UserBlock.Create` | `RemoveFollowsWhenUserBlockedEventHandler` | no |
| `UserUnblockedEvent` | `UserBlock.Unblock` | `ClearCacheWhenUserUnblocked...` (no-op) | no |

- Semantic quirk: `CreateNotificationWhenFollowAccepted` fires for any accepted follow (also direct follows of public users), message "X started following you", recipient = target; if `AcceptFollow` were exposed requester would not be notified
- Event class hierarchy (`DomainEvent : INotification`) is proven by `INotificationHandler<T>` usage; `AggregateRoot.DomainEvents/ClearDomainEvents/AddDomainEvent` shape from usage -> `Partially verified`

## 7. Repository contracts of interest

| Contract | Extra members | Live notes |
|---|---|---|
| `IPostRepository` | `GetByAuthorIdAsync`, `GetByUserIdPagedAsync(userId,page,pageSize,ct)` | only paged one is used (no visibility/block filter, creation-time desc) |
| `IUserRepository` | `IsEmailUniqueAsync` (mock: always true), `GetByAccountIdAsync`, `GetByIdAndAccountIdAsync`, `GetByUsernameAsync`, `GetUsersByIdsAsync` | `GetByUsernameAsync` unused by any handler |
| `IAccountRepository` | `GetByEmail/Phone/Identifier`, `GetAccountWithProfilesByIdentifierAsync` | identifier heuristic in mock (see backend-guide §6.4) |
| `IUserRelationRepository` | `GetRelationAsync(observer,target[,includeDeleted])` | no list/count/by-target queries -> followers/following lists impossible without new members |
| `IUserBlockRepository` | `IsBlockedAsync`, `GetBlockAsync`, `GetBlocksBetweenAsync` (both directions, one scan) | no "blocked by me" list |
| `ISavedItemRepository` | `GetSavedItemsByUserAsync`, `RemoveByTargetAsync` | no paging |
| `INotificationRepository` | `GetByRecipientIdAsync(recipient,page,pageSize)` | unused (no query handler) |
| `ILikeRepository`, `ICommentRepository` | `GetByUserAndTargetAsync` / none | comments: **no by-post query** |

- Unit of Work: `IUnitOfWork` (BuildingBlocks) implemented by `Infrastructure/Persistence/UnitOfWork/UnitOfWork.cs`; mock repos return `UnitOfWork => null!`

## 8. Feature-specific findings (follow, soft-delete, privacy, visibility, ownership)

| Topic | Implemented? | Evidence / gap |
|---|---|---|
| Follow / unfollow | yes (state machine §5.1) | `FollowUserCommand` -> `Result<string>` status name; unfollow 204 |
| Follow requests (private account) | domain only | no setter for privacy, no accept/decline/list use case |
| Soft-delete & restore (post, comment) | yes | restore permissions differ (post: author; comment: author-or-owner & must be deleter) |
| Soft-delete & restore (follow edge) | yes (restore by re-follow) | `includeDeleted: true` in `FollowUserAsync` |
| Block checks both directions | on **follow only** | everywhere else absent |
| Account privacy | flag exists | never read except in follow; no read-path effect |
| Post visibility | enum + field | never set (always Public), never enforced on reads |
| Ownership checks | writes only | reads are anonymous & unfiltered |
| Deleted-user handling | follow only | posts/likes/comments by deleted profiles stay readable |

## 9. Smallest next investigations
- Confirm `EntityMustBeDeletedToRestoreRule` & `IRepository` shapes (add BuildingBlocks to snapshot)
- Runtime confirm of §5.1/§5.2 event loss: follow user, `GET` nothing exposes counts -> verify via debug log of `FollowersCount` or one-off test against `MockDataStore.GetAllDomainEvents` (no BE source change needed beyond test project; deferred)
