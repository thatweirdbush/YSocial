---
module: FE <-> BE Integration Mapping
updated: 2026-10-20
contract: ysocial-clients/web-app/docs/swagger.json
roadmap: .context/roadmap.md
---

# FE <-> BE MAPPING

- Execution semantics (pipeline, error mechanism, auth lifecycle, events): `../architecture/backend-guide.md` (cited as BG §n)
- Aggregates, rules & state machines: `../architecture/domain-model.md` (cited as DM §n)
- Decisions D1-D28 (table §7 owns outcome; rationale in plan §4) & task history: `../plans/2026-10-15-backend-recovery-&-fe-integration.md` (plan)
- Acceptance = integration tests over real HTTP pipeline (`tests/YSocial.Api.IntegrationTests`, 468 tests, layers in `.context/backend/architecture/backend-unit-test.md`); Swagger != source of truth (copy regenerated at T2.6 & after T3: `swagger.json`, typed `ProducesResponseType`, `Swagger_*` contract tests)
- Paths: BE = BE-repo-relative (`src/...`); FE = relative to `ysocial-clients/web-app/`
- Status: BE contract frozen for CP0-CP4 (reached by tests): auth, profile, posts, threads, saved, graph, mute, feed, notifications; FE adopted every slice (CP = BE ready; FE slices F, C, G, N real by default, mock mode = `NEXT_PUBLIC_REAL_API_SLICES=none`); BE persists to PostgreSQL via EF Core (D25); NOT production-ready: process-local session lock & outbox poller, in-memory feed paging (BG §10); security hardening T4.3 done

## 1. Ground truth for integrators

| Topic | Fact | Evidence |
|---|---|---|
| FE integration state | **FE calls BE through `src/lib/api-client.ts` (JWT, single-flight refresh) & `src/lib/signalr-client.ts`**; each `features/*/services/*.ts` dispatches per function to `*.real.ts` adapter by `isRealApi(slice)` (default: all real); mock adapters (`mockDelay`, `src/mocks/*`) stay for BE-less features & mock mode | `fe-be-integration.md`, plan `2026-10-16-fe-be-integration.md` |
| Base URL | `https://localhost:49895` (FE default, override via `NEXT_PUBLIC_API_BASE_URL`; BE `launchSettings.json` matches); BE forces HTTPS redirect; CORS origin from `Cors:AllowedOrigins` (dev `http://localhost:3000`), credentials allowed | BG §8 |
| Auth header | `Authorization: Bearer <accessToken>`; SignalR via `?access_token=` | `Program.cs` `OnMessageReceived` |
| Actor id | decode JWT claim **`user_id`** (profile id), or read `GET /api/users/me`; login body has no user info; `sub` = account id, NEVER sent to social routes | `JwtProvider.cs`, `LoginResponse` |
| Token lifetimes | access 15 min (`Jwt:AccessTokenMinutes`); refresh 7 days, rotated on every refresh & switch; max 5 active sessions per account (6th login evicts oldest); logout does NOT invalidate issued access tokens (valid until expiry) | BG §6 |
| Refresh contract | `POST /api/identities/refresh-token {refreshToken}` anonymous -> `{accessToken, refreshToken, refreshTokenExpiry}`; any failure -> 401 `InvalidRefreshToken`; matches FE `api-client.ts` (route, body, fields) | `RefreshTests` |
| **Cross-tab refresh (FE done, CP1)** | refresh tokens are single-use: 2 tabs refreshing same token -> exactly 1 x 200, loser gets 401 `InvalidRefreshToken`. FE implements cross-tab single-flight (`navigator.locks`) and, after acquiring lock, re-reads stored refresh token & skips call if already rotated (adoption) | `Refresh_ConcurrentSameToken_ExactlyOne200` |
| JSON | camelCase; request enums = integers (`gender`, `targetType`), read DTO enums = lowercase strings; ids GUID strings; `DateTime` ISO UTC; `PostDto.parentId`/`imageUrl` omitted when null, other nullable fields (`bio`, `avatarUrl`, `coverUrl`, author `avatarUrl`) serialize as `null` (FE types must accept `null`, not only `undefined`) | BG §8 |
| Error body | RFC 7807 `ProblemDetails` on EVERY error: `type, title, status, detail, instance, code, traceId`; validation adds `errors: { field: string[] }` (camelCase keys); FE switches on `code` (list below) | BG §5, `ErrorPipelineTests` |
| Pagination | offset `page` (1-based) & `pageSize` (default 10; follow lists, follow requests, block & mute lists, notifications 20; max 50); invalid -> 400 `ValidationFailed`; page beyond last -> 200 empty `items` + real metadata; FE `nextPage = hasNextPage ? page + 1 : undefined` | `PaginationTests` |
| Id types | profile `UserId` everywhere (authors, targets, viewer); AccountId only in `register` response | DM §1 |
| Blocks (D14) | blocked either way = `404 NotFound` for profile, user posts, follow lists, post/thread reads, follow/like/bookmark/comment; ONLY exception = own block list; `isBlockedBy` always false | DM §5.2 |
| Private account (D15) | profile 200 (same field set); content lists 200 `locked: true`, empty `items`, `totalCount: 0`; locked is NEVER 404 | DM §5.1 |
| Idempotency | follow, unfollow, block, unblock, close-friend, PUT/DELETE like & bookmark are idempotent; post/comment delete is not idempotent (second call 404) | §2 |
| Validator precedence | FluentValidation runs first: empty/over-long content yields `ValidationFailed` + `errors`; domain rule codes (`PostContentInvalid`, `CommentContentInvalid`) appear only when validator did not catch case | `PostContentInvalid` |

### 1.1 Published error codes (37, pinned by `CodesSnapshot_MatchesApprovedList`; rename = contract change, update this table)

| Area | Code | HTTP | When |
|---|---|---|---|
| Generic | `ValidationFailed` | 400 | validator, model binding, malformed JSON, bad enum int (+ `errors`); rule-thrown email/phone/id checks (no `errors`) |
| Generic | `BusinessRuleViolated` | 400 | generic business failure (unclassified rule, `Result.Fail`: e.g. reset-password for unknown loginId) |
| Generic | `Unauthenticated` | 401 | JWT missing/invalid on `[Authorize]`, or handler auth check |
| Generic | `Forbidden` | 403 | generic forbidden / authorization denied |
| Generic | `NotFound` | 404 | unknown, deleted, blocked either way, hidden by privacy/visibility, route not matched |
| Generic | `Conflict` | 409 | generic conflict (specific 409s below); optimistic concurrency conflict (data changed by concurrent request: retry) |
| Generic | `InternalError` | 500 | unexpected fault only (`detail` generic outside Development) |
| Generic | `MethodNotAllowed` | 405 | known route, wrong HTTP method |
| Generic | `UnsupportedMediaType` | 415 | request body is not JSON |
| Auth | `InvalidCredentials` | 401 | login: unknown, deleted or wrong password (identical body) |
| Auth | `InvalidRefreshToken` | 401 | refresh/switch: unknown, expired, revoked, rotated token; bound profile or account gone |
| Auth | `AccountInactive` | 403 | login with VALID password on inactive account |
| Auth | `InvalidOtp` | 400 | reset-password: wrong OTP or no active token |
| Auth | `OtpAttemptsExceeded` | 400 | reset-password: 5 failed attempts |
| Account/profile | `EmailTaken` | 409 | register |
| Account/profile | `UsernameTaken` | 409 | register (case-insensitive, includes soft-deleted profiles) |
| Account/profile | `ProfileNotOwned` | 403 | switch/set-default to foreign, deleted or unknown profile |
| Account/profile | `CannotDeleteDefaultProfile` | 400 | delete default profile |
| Account/profile | `AccountRequiresProfile` | 400 | delete last profile; set-default with < 2 profiles |
| Account/profile | `ProfileFieldInvalid` | 400 | display name/bio/DOB/forbidden words |
| Post | `NotPostAuthor` | 403 | edit/delete/restore by non-author who can see post |
| Post | `PostNotDeleted` | 400 | restore of non-deleted post |
| Post | `PostContentInvalid` | 400 | content empty or > 2000 (when not caught by validator) |
| Comment | `NotCommentAuthor` | 403 | edit by non-author |
| Comment | `NotCommentAuthorOrPostOwner` | 403 | delete |
| Comment | `NotCommentDeleter` | 403 | restore by someone other than deleter |
| Comment | `CommentsDisabled` | 400 | post does not allow comments |
| Comment | `PostDeleted` | 400 | restore comment whose post is deleted |
| Comment | `ParentCommentMismatch` | 400 | parent comment belongs to another post |
| Comment | `CommentContentInvalid` | 400 | content empty or > 1000 |
| Comment | `CommentNotDeleted` | 400 | restore of non-deleted comment |
| Graph | `CannotFollowSelf` | 400 | follow self |
| Graph | `CannotBlockSelf` | 400 | block self |
| Graph | `CloseFriendRequiresAcceptedFollow` | 400 | close-friend flag while follow is not Accepted |
| Graph | `CannotMuteSelf` | 400 | mute self |
| Notification | `NotNotificationRecipient` | 403 | mark-read of another user's notification |
| Notification | `NotificationContentInvalid` | 400 | domain only (never produced by route) |

## 2. Endpoint matrix by feature

Legend: **Auth** = effective requirement (`JWT` = `[Authorize]`; `handler` = no attribute, handler returns 401; `anon` = anonymous, optional viewer from JWT). Success status & body first, errors in next column (all errors are ProblemDetails with `code`). FE column = counterpart module (`mock` = FE has no real adapter for it (BE-less feature))

### 2.1 Identities (`IdentitiesController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `POST /api/identities/register` | anon | `{email, password(>=6), username(^[a-z0-9._]{3,30}$), phoneNumber?}` -> 201 `{accountId}` | 400 `ValidationFailed` (+`errors`); 409 `EmailTaken` / `UsernameTaken`; no tokens (login next); no orphan account on failure | `auth-service.register` (real adapter, then auto-login); FE username pattern matches |
| `POST /api/identities/login` | anon | `{loginId, password, deviceId}` -> 200 `{accessToken, refreshToken, refreshTokenExpiry}` | `loginId` = email/phone/username; 401 `InvalidCredentials` (unknown/deleted/wrong password identical); 403 `AccountInactive` (valid password only); 400 `ValidationFailed` | `auth-service.login` (real adapter bootstraps viewer from `GET me`); FE identity step validates format only |
| `POST /api/identities/refresh-token` | anon | `{refreshToken}` -> 200 same as login | 401 `InvalidRefreshToken`; 400 empty body; single-use: see §1 cross-tab | `token-refresh.ts` via `api-client.ts` (cross-tab `navigator.locks` single-flight, rotation adoption) |
| `POST /api/identities/logout` | anon | `{refreshToken}` -> 204 | ALWAYS 204 for active/unknown/revoked/expired/rotated; revokes token family; 400 empty body | `auth-service.logout` (best-effort POST, then local clear) |
| `POST /api/identities/forgot-password` | anon | `{loginId}` -> 204 | always 204 (also unknown ids); OTP only delivered to mock senders (logged); FE cannot receive | `auth-service.forgotPassword` |
| `POST /api/identities/reset-password` | anon | `{loginId, otp(6), newPassword(>=6)}` -> 204 | 400 `InvalidOtp` / `OtpAttemptsExceeded` / `ValidationFailed` / `BusinessRuleViolated` (unknown loginId); success revokes all refresh tokens | `auth-service.resetPassword` |
| `DELETE /api/identities/account` | JWT | -> 204 | 401; soft-deletes account + profiles; existing access token works until expiry | `settings` danger zone (not built) |

### 2.2 Users & profile (`UsersController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `GET /api/users/me` | JWT | -> 200 `MeDto` | 401; ONLY place exposing `email` & account `profiles` (switcher) | `ensureViewerUser` |
| `GET /api/users/{id}` | anon | -> 200 `UserProfileDto` | 404 unknown/deleted/blocked either way; private non-follower = 200 same field set | `user-service.fetchUser` |
| `GET /api/users/by-username/{username}` | anon | -> 200 `UserProfileDto` | case-insensitive; 404 as above; 400 over 30 chars | `fetchUserByUsername`, route `/[@username]` |
| `GET /api/users/{id}/followers` | anon | `?page&pageSize(20)&query` -> 200 `FollowListPageDto` | accepted edges only, newest first; private non-permitted = 200 `locked: true` (`totalCount` 0); 404 blocked/deleted; `query` <= 50 chars (username or display name, case & diacritics insensitive) | `fetchFollowList` |
| `GET /api/users/{id}/following` | anon | same as followers | same | `fetchFollowList` |
| `GET /api/users/me/follow-requests` | JWT | `?page&pageSize(20)&query` -> 200 `FollowListPageDto` (`locked` false) | pending requests, newest first, deleted/blocked requesters excluded before paging; 401 | `fetchFollowRequests` |
| `GET /api/users/me/follow-requests/count` | JWT | -> 200 `{count}` | same filter as list | `fetchFollowRequestCount` |
| `GET /api/users/me/relation-sets` | JWT | -> 200 `RelationSetsDto` | `blocked`, `muted`, `closeFriends` (dormant flags included), `isPrivate`, `requestCount`; no `blockedBy` | `fetchRelationSets`, `fetchCloseFriendCandidates` |
| `GET /api/users/me/blocks` | JWT | `?page&pageSize(20)&query` -> 200 `PagedResponse<UserProfileDto>` (items `isBlocked: true`, no `locked`) | newest block first; deleted users omitted; `query` = RelationSearch (max 50, applied before paging) | `fetchBlockedUsers` |
| `GET /api/users/me/mutes` | JWT | `?page&pageSize(20)&query` -> 200 `PagedResponse<UserProfileDto>` (items `isMuted: true`) | newest mute first (`MutedAt`); dormant mutes included; blocked/deleted users excluded BEFORE paging & `totalCount`; `query` <= 50 chars (relation search rule); 400 bad paging; 401 | `fetchMutedUsers` |
| `PUT /api/users/profiles/me/privacy` | JWT | `{isPrivate}` -> 200 `{acceptedCount}` | going public accepts ONLY pending requests (count = transitions); going private/same value -> 0 | `setPrivateAccount` |
| `PUT /api/users/profiles/me` | JWT | `{displayName, bio?, avatarUrl?, coverUrl?, gender?(0..3), dateOfBirth?}` -> 200 `UserProfileDto` | edits JWT profile; omitted `gender`/`dateOfBirth` keep stored values (read DTO exposes neither); 400 `ValidationFailed` / `ProfileFieldInvalid`; no username/email/privacy; urls are plain strings (no upload API) | `updateProfile` |
| `PUT /api/users/profiles/switch` | JWT | `{profileId, refreshToken}` -> 200 `LoginResponse` | rotates refresh token, new JWT; 403 `ProfileNotOwned` (foreign/deleted/unknown profile); 401 `InvalidRefreshToken` | profile switcher (roadmap 2.7) |
| `PATCH /api/users/profiles/{id}/default` | JWT | -> 204 | 403 `ProfileNotOwned`; 400 `AccountRequiresProfile` | none |
| `DELETE /api/users/profiles/{id}` | JWT | -> 204 | 404 foreign/unknown; 400 `CannotDeleteDefaultProfile` / `AccountRequiresProfile` | none |


### 2.3 Posts (`PostsController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `GET /api/posts/{id}` | anon | -> 200 `PostDto` | 404 unknown/deleted/hidden/blocked either way; viewer flags false for anonymous | `post-service.fetchPostThread` (via threads) |
| `POST /api/posts` | JWT | `{content(<=2000), imageUrl?(abs http(s), <=2048)}` -> 201 `PostDto` + `Location: /api/posts/{id}` | text-only allowed; 400 `ValidationFailed`; single image URL only, no upload; no visibility/audience input (always `public`) | `createPost` + `PostCreatorCore` |
| `PUT /api/posts/{id}` | JWT | `{content}` -> 200 `PostDto` (`isEdited` true) | 403 `NotPostAuthor`; 404 unknown or hidden from editor; 400 | `updatePostContent` |
| `DELETE /api/posts/{id}` | JWT | -> 204 | soft-delete; 403 `NotPostAuthor` (visible post); 404 unknown/already deleted/hidden from non-author | `deletePost` (FE has no undo) |
| `PUT /api/posts/{id}/restore` | JWT | -> 204 | author only (non-author gets 403 on live visible post, 404 on deleted or hidden one); 400 `PostNotDeleted`; saved items not restored | - |
| `GET /api/posts/user/{userId}` | anon | `?page&pageSize(10)` -> 200 `UserPostsPageDto` | root posts newest first, filtered BEFORE paging & counting; private non-permitted = `locked: true`; 404 blocked/deleted; `userId` = profile id | `fetchUserPosts(userId, "threads", page)` (tabs `replies`/`media` not supported) |
| `POST /api/posts/{id}/share-link` | JWT | no body -> 200 `{postId, sharedUrl}` | URL `{App:FrontendUrl}/posts/{id}` (FE route); 404 unknown/deleted/hidden/blocked; legacy `?username=` ignored; 401 | client-built links in `PostCard` |

- Not found: search, trending, tags, pin, hide-like-count, multi-image, media upload, drafts (`searchPosts`, `fetchPostsByTag`, `fetchTrendingTags`, `setPostPinned`, `setHideLikeCount` stay mock)

### 2.4 Threads & comments (FE models replies as posts: `PostDto` for both kinds)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `GET /api/threads/{id}` | anon | id = post OR comment id -> 200 `ThreadDto` | 404 hidden/deleted/blocked/unknown; inaccessible parent -> `parent: null`; replies & 1 level `childReplies` newest first, filtered | `fetchPostThread(id)`; `/posts/[replyId]` resolvable |
| `POST /api/comments` | handler | `{postId, content, parentCommentId?}` -> 201 `PostDto` (`kind: comment`) + `Location: /api/threads/{id}` | `Guid.Empty` parent = null; 404 post/parent unknown, deleted or inaccessible; 400 `ParentCommentMismatch` / `CommentsDisabled` / `CommentContentInvalid` / `ValidationFailed`; 401; notifies post author (also self) | `createReply(parentId, ...)` |
| `PUT /api/comments/{id}` | handler | `{content}` -> 200 `PostDto` | 403 `NotCommentAuthor`; 404 | none (FE edits via post edit) |
| `DELETE /api/comments/{id}` | handler | -> 204 | 403 `NotCommentAuthorOrPostOwner` (visible target); 404 unknown, deleted or hidden from non-participant; soft | - |
| `PUT /api/comments/{id}/restore` | handler | -> 204 | 403 `NotCommentDeleter`; 400 `CommentNotDeleted` / `PostDeleted` | - |

### 2.5 Likes & saved (`LikesController`, `SavedItemsController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `PUT` / `DELETE /api/posts/{id}/like` | handler | no body -> 204 | idempotent; 404 unknown/hidden/blocked target; 401 | `setPostLike(id, liked)` |
| `PUT` / `DELETE /api/comments/{id}/like` | handler | no body -> 204 | same; comment target (route by `kind`) | `setPostLike` for replies |
| `PUT` / `DELETE /api/posts/{id}/bookmark` | handler | no body -> 204 | idempotent; same 404 rules | `setPostBookmark` |
| `PUT` / `DELETE /api/comments/{id}/bookmark` | handler | no body -> 204 | same | `setPostBookmark` for replies |
| `GET /api/saveditems/posts` | handler | `?page&pageSize(10)` -> 200 `PagedResponse<PostDto>` | newest saved first; deleted/blocked/privacy-revoked posts excluded BEFORE paging & `totalCount`; 401; collections, drag sort, bulk unsave = FE-only | `fetchSavedPosts(page)`, `/saved` |

- Counts: `likesCount` = stored aggregate (not viewer-filtered, accepted exception); viewer flags `isLikedByCurrentUser`/`isBookmarkedByCurrentUser` in `PostDto`

### 2.6 Social graph (`UserRelationsController`, `UserBlocksController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `POST /api/users/{targetId}/relations/follow` | JWT | -> 200 `{followStatus: "accepted" \| "pending"}` | idempotent (current status); `pending` if target private; 400 `CannotFollowSelf`; 404 missing/deleted/blocked either way; 401 | `followUser(id, actorId)` |
| `DELETE /api/users/{targetId}/relations/follow` | JWT | -> 204 | unfollow == cancel pending; absent edge -> 204 | `unfollowUser` |
| `PATCH /api/users/{targetId}/relations/close-friend` | JWT | `{isCloseFriend}` -> 204 | only while Accepted, else 400 `CloseFriendRequiresAcceptedFollow`; FE keeps dormant flags (`closeFriends` set includes dormant ones via `relation-sets`) | `setCloseFriend` |
| `POST /api/users/{targetId}/relations/follow-request` | JWT | `{decision: "accept" \| "decline"}` -> 204 | 404 no pending request or inaccessible requester; 400 bad decision; accept notifies requester; decline soft-deletes edge (no event) | `respondFollowRequest` |
| `POST /api/users/{targetId}/blocks` | JWT | -> 204 | idempotent; 404 missing/deleted target; 400 `CannotBlockSelf`; purges follows both directions in same request | `setBlocked(id, true)` |
| `DELETE /api/users/{targetId}/blocks` | JWT | -> 204 | idempotent; follows not restored; 401 | `setBlocked(id, false)` |
| `PUT /api/users/{targetId}/relations/mute` | JWT | no body -> 204 | idempotent; never changes follow state (no edge -> hidden `None` edge, soft-deleted edge stays deleted, flag is dormant); 400 `CannotMuteSelf`; 404 unknown/deleted/blocked either way; 401 | `setMuted(id, true)` |
| `DELETE /api/users/{targetId}/relations/mute` | JWT | no body -> 204 | idempotent; always 204 for authenticated callers (no 404, also for hidden users); 401 | `setMuted(id, false)` |


### 2.7 Notifications (`NotificationsController`, SignalR `/hubs/notifications`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `GET /api/notifications` | JWT | `?page&pageSize(20)&kind` -> 200 `NotificationPageDto` | newest first; notifications of blocked/deleted senders excluded BEFORE paging, `totalCount` & `unreadCount`; `kind` (D26) = `like` \| `reply` \| `follow` narrows list & `totalCount` (access filter, then kind, then count, then page) while `unreadCount` stays OVERALL; `kind` absent, empty or whitespace = all (MVC binds blank to null), case-insensitive, unknown value -> 400 `ValidationFailed` + `errors.kind`; repeated `kind=a&kind=b` binds ONE value (no custom binder, do not rely on it); 400 bad paging; 401 | `notification-service.fetchNotifications(page, filter)` + `notification-store` (`/notifications`) |
| `GET /api/notifications/unread-count` | JWT | -> 200 `{count}` | same sender filter as list | `fetchUnreadCount` via `syncUnreadCount` (store) & `NotificationNavBadge` |
| `PUT /api/notifications/{id}/read` | JWT | no body -> 204 | idempotent; 403 `NotNotificationRecipient` (foreign notification); 404 unknown; 401 | `commitMarkRead` (item open) |
| `PUT /api/notifications/read-all` | JWT | `?upToId` (optional guid) no body -> 204 | idempotent; marks only own; `upToId` (D28) bounds it to that notification and older (`CreatedAt <=`, ties included) so rows created after the client's last view stay unread; unknown id -> 404; foreign id -> 403 `NotNotificationRecipient`; id lookup skips the sender access filter (sender may be blocked after page load); hidden senders' rows never touched | `commitMarkAllRead` (always sends newest loaded id) |
| `GET /api/notifications/preferences` | JWT | -> 200 `NotificationPreferencesDto` | per active profile; defaults all `true`; 401 | `getNotificationPreferences` (D27) |
| `PUT /api/notifications/preferences` | JWT | `{likes, replies, follows}` all required bool -> 200 `NotificationPreferencesDto` | full replace; missing or null field -> 400 `ValidationFailed` (nothing changed); `likes` = `NewLike` (posts AND replies), `replies` = `NewComment` (notifies the POST author only), `follows` = `NewFollow`, `FollowRequested`, `FollowAccepted`; off = no row and no push from then on, no backfill when re-enabled; 401 | `updateNotificationPreferences` (settings section) |

| Item | Actual | FE counterpart |
|---|---|---|
| Hub auth | `[Authorize]`, token via `access_token` query; connection user = `user_id` | `signalr-client.ts` `createNotificationHub`: WebSockets, `skipNegotiation`, `accessTokenFactory` reads current token |
| Event | `ReceiveNotification` with 1 `NotificationDto` (same item shape as list) | FE `NotificationPayload` = `NotificationDto`; `toNotificationItem` groups by `kind` (unknown -> generic `other`), `NotificationLiveSync` pushes into `notification-store` |
| Types | `NewLike`, `NewComment`, `NewFollow` (public follow, notifies followed user), `FollowRequested`, `FollowAccepted` (notifies REQUESTER) | FE `NotificationKind` like \| follow \| reply = `kind` |
| Self events | no notification (self like, self comment) | - |
| Persistence | notification rows in DB (saved with the change that caused them); delivered outbox rows deleted; push reaches only active profile connection | - |

- Gaps: no `postContentPreview` for replies (FE shows snippet; fetch comment via `/api/threads/{targetId}`)

### 2.8 Feed (`FeedController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `GET /api/feed` | anon for `forYou`, JWT for `following` | `?tab=forYou\|following&page&pageSize(10)` -> 200 `PagedResponse<PostDto>` | root posts only, newest first; `forYou` = every post viewer may see; `following` = own + accepted followees (pending excluded); muted authors excluded in both tabs (dormant mutes too); policy & mute filter BEFORE `totalCount`/paging; page beyond last -> 200 empty + metadata; 400 bad `tab`/paging; 401 `following` anonymous | `fetchFeed(tab, page, viewerId)`; `nextPage = hasNextPage ? page + 1 : undefined`; new-posts pill stays FE-only (no push) |

## 3. DTO shapes (JSON as serialized)

```yaml
PostDto:                       # posts & comments (FE PostItem)
  id: guid
  kind: post | comment
  postId: guid                 # root post id; == id when kind=post
  parentId: guid               # OMITTED when null; comment only: parent comment id, or postId for top-level comment
  content: string
  imageUrl: string             # OMITTED when null; posts only
  createdAt: datetime
  isEdited: bool
  likesCount: int              # stored aggregate, not viewer-filtered
  commentsCount: int           # DIRECT accessible children only
  isLikedByCurrentUser: bool   # false for anonymous
  isBookmarkedByCurrentUser: bool
  user: { id, username, displayName, avatarUrl: string|null, isVerified: false }
  visibility: public | followersOnly | private     # comments inherit root post; always public today
ThreadDto:
  post: PostDto                # requested item (post or comment)
  parent: PostDto | null       # comment: parent comment, or root post for top-level; null when inaccessible
  replies: PostDto[]           # direct accessible children, newest first
  childReplies: { [replyId]: PostDto[] }   # 1 level below replies, newest first
UserProfileDto:                # SAME field set for every viewer incl. owner (no email, no profiles)
  id, username, displayName, bio|null, avatarUrl|null, coverUrl|null
  followersCount, followingCount   # computed on read: accepted edges with discoverable other party (== follow list totalCount)
  isPrivate, isVerified: false
  followStatus: none | pending | accepted
  isFollowing: bool            # followStatus == accepted
  viewerMarkedCloseFriend: bool   # includes dormant flag
  isMuted: bool                # viewer's mute flag (dormant flag included)
  isBlocked: bool              # true ONLY inside GET /api/users/me/blocks
  isBlockedBy: bool            # ALWAYS false (any such read is 404); kept for FE type compat
MeDto: { profile: UserProfileDto, email, profiles: [{ id, username, displayName, avatarUrl|null, isDefault }] }
PagedResponse<T>: { items: T[], page, pageSize, totalCount, hasNextPage }
UserPostsPageDto: PagedResponse<PostDto> + { locked: bool }
FollowListPageDto: PagedResponse<UserProfileDto> + { locked: bool }
RelationSetsDto: { blocked: guid[], muted: guid[], closeFriends: guid[], isPrivate, requestCount }
FollowRequestCountDto: { count }
PrivacyUpdatedDto: { acceptedCount }
LoginResponse: { accessToken, refreshToken, refreshTokenExpiry }
FollowUserResponse: { followStatus: accepted | pending }
NotificationDto: { id, type, kind: like|reply|follow, title, message, createdAt, isRead, targetId: guid|null, senderId, senderName: string|null, senderUsername: string|null, senderAvatar: string|null }
NotificationPageDto: PagedResponse<NotificationDto> + { unreadCount }   # unreadCount = overall, never per kind
NotificationPreferencesDto: { likes, replies, follows }
UnreadCountDto: { count }
SharePostLinkResponse: { postId, sharedUrl }
```

- Status outcomes per profile/content read: accessible -> 200 data | private & not permitted -> 200 `locked: true` (lists) / 200 profile | blocked either way, deleted, unknown, inaccessible post -> 404 `NotFound`; response NEVER mixes `locked` with 404 semantics
- Frozen spec of contract: this section (plan §4.2 links here)

## 4. FE requirement coverage

| FE requirement | BE status | Gap / decision needed |
|---|---|---|
| Login / register / forgot / reset | Done | OTP delivery is mock (logged) |
| Session persistence / silent refresh / logout | Done | FE cross-tab single-flight (§1) & `/login` redirect |
| Feed (for-you / following tabs), new-posts pill | Done (tabs) | `GET /api/feed`; pill needs push (not built) |
| Post detail + replies | Done | `GET /api/threads/{id}` |
| Create post (text, 1 image URL) | Done | multi-image, upload, audience unsupported |
| Edit (text) / delete | Done | no undo in FE vs restore in BE |
| Pin, hide like count, reposts, polls, drafts | Unsupported | no domain concept (deferred, design needed) |
| Like / bookmark | Done | idempotent PUT/DELETE routes |
| Saved page (pagination) | Done | collections/drag sort/bulk unsave FE-only |
| Search, trending, `/tags/[tag]`, hashtags/mentions | Unsupported | no search/tag/mention model |
| Profile page (header, counts, tabs, `followStatus`, followers dialog) | Done | share link route differs; tabs `replies`/`media` unsupported |
| Edit profile | Done | upload missing; username/email not editable |
| Follow / unfollow, `FollowStatus` | Done | lowercase string |
| Private account & follow requests | Done | privacy toggle, list, count, respond |
| Close friends manager | Done | `relation-sets.closeFriends`; audience for posts deferred (D17) |
| Block | Done | own list; D14: blocked profile is 404 (FE "blocked by" states removed) |
| Mute | Done | PUT/DELETE mute, `me/mutes`, `isMuted` on profiles |
| Restrict | Unsupported | no concept |
| Visibility / viewer-scoped content rules | Done server-side | FE close-friends audience has no BE value |
| Notifications list, unread, mark read, realtime | Done | HTTP API + push of 5 types; no reply preview text |
| Notification filter tabs (like/reply/follow), bounded mark-all, per-kind preferences | Done | D26-D28; Mentions tab unsupported (no mention model, mock only) |
| Profile switcher | Done | `GET me` + `PUT profiles/switch` (replace both tokens, reset viewer stores) |
| Settings: sessions, language, deactivate | Unsupported | delete account exists |
| DMs, report, onboarding | Unsupported | no code |

## 5. Integration risks (closed)

> error shapes & 500s, text-only post, logout/refresh/session cap, event dispatch, identity (`user_id`, username), read endpoints, privacy/block enforcement, toggle vs set routes, response codes, SignalR payload, security hardening; history in plan T1-T4

## 6. FE checkpoints & follow-ups

> FE adoption DONE; as-built: `fe-be-integration.md` (post delete moves CP1 -> Phase C); plan: `2026-10-16-fe-be-integration.md`. FE work is out of scope of recovery; CP = BE contract frozen for slice + test evidence. FE never consumes slice before its CP; mocks stay for everything else

| CP | Slice unblocked | BE state |
|---|---|---|
| CP0 | FE plumbing: base URL, ProblemDetails normalizer (`code` switch), JWT `user_id` decoder, login redirect `/login` | reached (tests); FE (Phase F) |
| CP1 | auth (login, register with username, forgot/reset, logout, silent refresh), post delete | reached (tests); manual login -> refresh -> logout smoke verified 2026-10-15 (BG §12); FE auth (Phase F), post delete moves to FE Phase C |
| CP2 | profile header & edit, switcher (`GET me`), post create/edit, post detail + thread, profile threads tab, saved page, like/bookmark | FE (Phase C, follow & feed read moved here); reached (tests, swagger verified) |
| CP3 | private account, follow requests, followers dialog, block list, close friends | FE (Phase G); reached (tests, swagger regenerated) |
| CP4 | feed, notifications, mute | FE (feed in Phase C, mute & notifications in Phase N); reached (tests, swagger regenerated) |

## 7. Contract decisions (D-ids, owner of outcome; rationale: plan §4)

| D | Decision (contract) | Status |
|---|---|---|
| D1, D2 | ProblemDetails + stable `code` catalog (§1.1), codes independent of class names | Implemented (T1.1a/b) |
| D3 | Login failure: uniform 401 `InvalidCredentials`; 403 `AccountInactive` only after valid password | Implemented |
| D4 | Session cap 5; 6th login evicts oldest, no error | Implemented |
| D5 | Refresh `POST /api/identities/refresh-token`, rotation, profile-bound token, 401 `InvalidRefreshToken` | Implemented |
| D6 | Access 15 min, refresh 7 days; no per-request revocation; per-account session lock; FE cross-tab single-flight required | Implemented (BE & FE) |
| D7 | Write responses: 201 `PostDto` + `Location`, 200 `PostDto`/`UserProfileDto` on update, 204 no payload, register 201 `{accountId}` | Implemented |
| D8 | Follow response `{followStatus}` | Implemented |
| D9 | Read DTO enums = lowercase-camel strings; request bodies keep ints | Implemented |
| D10 | Idempotent PUT/DELETE like/bookmark routes (no body); toggle endpoints removed after FE adoption | Implemented |
| D11 | Register `username`: format = validator (400), uniqueness = handler (409 `UsernameTaken`/`EmailTaken`) | Implemented |
| D12, D13 | Unified `PostDto` for posts & comments; parent must belong to same post; `GET /api/threads/{id}` | Implemented |
| D14 | Blocked either way = 404 on all discovery, content & interactions; own block list exempt | Implemented (reads T2, writes T3.3) |
| D15 | Private profile: 200 profile same field set; lists `locked: true`; never 404 | Implemented |
| D16 | Offset pagination (default 10/20, max 50), invalid = 400, beyond last = 200 empty | Implemented |
| D17 | Post audience on create: none (all public); `closeFriends` deferred | Deferred |
| D18 | `imageUrl` optional single URL; no upload endpoint | Implemented |
| D19 | Dev origin `https://localhost:49895`, CORS from config, deterministic seed | Implemented |
| D20 | Content of soft-deleted profiles hidden from all reads | Implemented |
| D21 | Mute = idempotent PUT/DELETE flag (`MutedAt`), never touches follow state or follow ordering; no edge -> hidden `None` edge; `CannotMuteSelf`; list `me/mutes` | Implemented (T3.4) |
| D22 | Feed = offset pagination (default 10), `forYou` anonymous, `following` authenticated, muted authors excluded, policy before paging | Implemented (T4.1) |
| D23 | Notifications: 1 `NotificationDto` for HTTP & push, `NewFollow` type, self notifications skipped, foreign mark-read 403, blocked/deleted senders filtered before paging | Implemented (T4.2) |
| D24 | Security: log redaction by member name/attribute, JWT key required outside Development, seed & dev token Development-only | Implemented (T4.3) |
| D25 | Persistence: PostgreSQL via EF Core; 1 DB transaction per request (failed request saves nothing); data & sessions survive restarts; optimistic concurrency on `Account` (multi-instance only: refresh/switch 401, logout/forgot-password 204, other account writes 409 `Conflict`); routes, DTOs & codes UNCHANGED (FE impact: none, refresh tokens now outlive BE restarts) | Implemented |
| D26 | Notification list `kind` filter: `like\|reply\|follow` (case-insensitive), order access filter -> kind -> count -> page, `unreadCount` overall, blank = all, unknown = 400 `ValidationFailed`; no new code | Implemented |
| D27 | Notification preferences: per-profile `{likes, replies, follows}` (owned VO on `User`, migration default `true`), full-replace PUT with required fields, disabled kind skipped at publish (no row, no push, no backfill) | Implemented |
| D28 | Bounded read-all: `PUT read-all?upToId` marks that notification & older only (id not timestamp: JS ms vs Postgres microseconds); 404 unknown, 403 foreign, sender access filter skipped for the lookup | Implemented |

- **Open:** media upload URL shape, feed ranking (`forYou` chronological), notification reply preview, access-token revocation, audience `CloseFriends`, search/tags/trending, process-local session lock & outbox poller, in-memory feed paging, counter concurrency (restart no longer wipes state; dev seed ids stay deterministic) full register: BG §10

## 8. Evidence
- Probes of original behavior (T0.2) & their current results: `../architecture/backend-guide.md` §12
