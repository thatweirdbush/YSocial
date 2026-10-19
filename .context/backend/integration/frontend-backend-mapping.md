---
module: FE <-> BE Integration Mapping
updated: 2026-10-16
contract: ysocial-clients/web-app/docs/swagger.json
fe-roadmap: .context/features/frontend-roadmap.md
---

# FE <-> BE MAPPING

- Execution semantics (pipeline, error mechanism, auth lifecycle, events): `../architecture/backend-guide.md` (cited as BG §n)
- Aggregates, rules & state machines: `../architecture/domain-model.md` (cited as DM §n)
- Decisions D1-D24 (table §7 owns outcome; rationale in plan §4) & task history: `../plans/2026-10-15-backend-recovery-&-fe-integration.md` (plan)
- Acceptance = integration tests over real HTTP pipeline (`tests/YSocial.Api.IntegrationTests`); Swagger != source of truth (copy regenerated at T2.6 & after T3: `swagger.json`, typed `ProducesResponseType`, `Swagger_*` contract tests)
- Paths: BE = BE-repo-relative (`src/...`); FE = relative to `ysocial-clients/web-app/`
- **Status 2026-10-15:** BE contract frozen for CP0-CP4 (reached by tests): auth, profile, posts, threads, saved, graph, mute, feed, notifications; FE still on mocks (CP = BE ready, FE adoption pending); BE NOT production-ready: in-memory store, no transactions (BG §7.2, §10); security hardening T4.3 done

## 1. Ground truth for integrators

| Topic | Fact | Evidence |
|---|---|---|
| FE integration state | **No FE feature calls BE yet.** `src/lib/api-client.ts` & `src/lib/signalr-client.ts` have 0 importers; every `features/*/services/*.ts` is mock (`mockDelay`, `src/mocks/*`); only DTO types are imported from `src/lib/api/generated.ts` (request types) | grep `api-client|apiClient|apiFetch|signalr-client` over `src` |
| Base URL | `https://localhost:49895` (FE hard-codes it; BE `launchSettings.json` matches); BE forces HTTPS redirect; CORS origin from `Cors:AllowedOrigins` (dev `http://localhost:3000`), credentials allowed | BG §8 |
| Auth header | `Authorization: Bearer <accessToken>`; SignalR via `?access_token=` | `Program.cs` `OnMessageReceived` |
| Actor id | decode JWT claim **`user_id`** (profile id), or read `GET /api/users/me`; login body has no user info; `sub` = account id, NEVER sent to social routes | `JwtProvider.cs`, `LoginResponse` |
| Token lifetimes | access 15 min (`Jwt:AccessTokenMinutes`); refresh 7 days, rotated on every refresh & switch; max 5 active sessions per account (6th login evicts oldest); logout does NOT invalidate issued access tokens (valid until expiry) | BG §6 |
| Refresh contract | `POST /api/identities/refresh-token {refreshToken}` anonymous -> `{accessToken, refreshToken, refreshTokenExpiry}`; any failure -> 401 `InvalidRefreshToken`; matches FE `api-client.ts` (route, body, fields) | `RefreshTests` |
| **Cross-tab refresh (FE REQUIRED, CP1)** | refresh tokens are single-use: 2 tabs refreshing same token -> exactly 1 x 200, loser gets 401 `InvalidRefreshToken` & `clearAuth` logs out ALL tabs. FE MUST add cross-tab single-flight (`navigator.locks` or BroadcastChannel) and, after acquiring lock, re-read stored refresh token & skip call if already rotated | `Refresh_ConcurrentSameToken_ExactlyOne200` |
| JSON | camelCase; request enums = integers (`gender`, `targetType`), read DTO enums = lowercase strings; ids GUID strings; `DateTime` ISO UTC; `PostDto.parentId`/`imageUrl` omitted when null, other nullable fields (`bio`, `avatarUrl`, `coverUrl`, author `avatarUrl`) serialize as `null` (FE types must accept `null`, not only `undefined`) | BG §8 |
| Error body | RFC 7807 `ProblemDetails` on EVERY error: `type, title, status, detail, instance, code, traceId`; validation adds `errors: { field: string[] }` (camelCase keys); FE switches on `code` (list below) | BG §5, `ErrorPipelineTests` |
| Pagination | offset `page` (1-based) & `pageSize` (default 10; follow lists, follow requests, block & mute lists, notifications 20; max 50); invalid -> 400 `ValidationFailed`; page beyond last -> 200 empty `items` + real metadata; FE `nextPage = hasNextPage ? page + 1 : undefined` | `PaginationTests` |
| Id types | profile `UserId` everywhere (authors, targets, viewer); AccountId only in `register` response | DM §1 |
| Blocks (D14) | blocked either way = `404 NotFound` for profile, user posts, follow lists, post/thread reads, follow/like/bookmark/comment; ONLY exception = own block list; `isBlockedBy` always false | DM §5.2 |
| Private account (D15) | profile 200 (same field set); content lists 200 `locked: true`, empty `items`, `totalCount: 0`; locked is NEVER 404 | DM §5.1 |
| Idempotency | follow, unfollow, block, unblock, close-friend, PUT/DELETE like & bookmark are idempotent; toggle endpoints still exist (deprecated after CP2); post/comment delete is not idempotent (second call 404) | §2 |
| Validator precedence | FluentValidation runs first: empty/over-long content yields `ValidationFailed` + `errors`; domain rule codes (`PostContentInvalid`, `CommentContentInvalid`) appear only when validator did not catch case | `PostContentInvalid` |

### 1.1 Published error codes (37, pinned by `CodesSnapshot_MatchesApprovedList`; rename = contract change, update this table)

| Area | Code | HTTP | When |
|---|---|---|---|
| Generic | `ValidationFailed` | 400 | validator, model binding, malformed JSON, bad enum int (+ `errors`); rule-thrown email/phone/id checks (no `errors`) |
| Generic | `BusinessRuleViolated` | 400 | generic business failure (unclassified rule, `Result.Fail`: e.g. reset-password for unknown loginId) |
| Generic | `Unauthenticated` | 401 | JWT missing/invalid on `[Authorize]`, or handler auth check |
| Generic | `Forbidden` | 403 | generic forbidden / authorization denied |
| Generic | `NotFound` | 404 | unknown, deleted, blocked either way, hidden by privacy/visibility, route not matched |
| Generic | `Conflict` | 409 | generic conflict (specific 409s below) |
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

Legend: **Auth** = effective requirement (`JWT` = `[Authorize]`; `handler` = no attribute, handler returns 401; `anon` = anonymous, optional viewer from JWT). Success status & body first, errors in next column (all errors are ProblemDetails with `code`). FE column = counterpart module (`mock` = FE works on mocks, BE not wired)

### 2.1 Identities (`IdentitiesController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `POST /api/identities/register` | anon | `{email, password(>=6), username(^[a-z0-9._]{3,30}$), phoneNumber?}` -> 201 `{accountId}` | 400 `ValidationFailed` (+`errors`); 409 `EmailTaken` / `UsernameTaken`; no tokens (login next); no orphan account on failure | `register-form.tsx` (mock); FE username pattern matches |
| `POST /api/identities/login` | anon | `{loginId, password, deviceId}` -> 200 `{accessToken, refreshToken, refreshTokenExpiry}` | `loginId` = email/phone/username; 401 `InvalidCredentials` (unknown/deleted/wrong password identical); 403 `AccountInactive` (valid password only); 400 `ValidationFailed` | `login-form.tsx` (mock, `utils/mock-session.ts`); FE identity step validates format only |
| `POST /api/identities/refresh-token` | anon | `{refreshToken}` -> 200 same as login | 401 `InvalidRefreshToken`; 400 empty body; single-use: see §1 cross-tab | `api-client.ts` (unused) |
| `POST /api/identities/logout` | anon | `{refreshToken}` -> 204 | ALWAYS 204 for active/unknown/revoked/expired/rotated; revokes token family; 400 empty body | not wired |
| `POST /api/identities/forgot-password` | anon | `{loginId}` -> 204 | always 204 (also unknown ids); OTP only delivered to mock senders (logged); FE cannot receive | forgot flow in `login-form.tsx` (mock) |
| `POST /api/identities/reset-password` | anon | `{loginId, otp(6), newPassword(>=6)}` -> 204 | 400 `InvalidOtp` / `OtpAttemptsExceeded` / `ValidationFailed` / `BusinessRuleViolated` (unknown loginId); success revokes all refresh tokens | reset step (mock) |
| `DELETE /api/identities/account` | JWT | -> 204 | 401; soft-deletes account + profiles; existing access token works until expiry | `settings` danger zone (not built) |

### 2.2 Users & profile (`UsersController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `GET /api/users/me` | JWT | -> 200 `MeDto` | 401; ONLY place exposing `email` & account `profiles` (switcher) | `ensureViewerUser` |
| `GET /api/users/{id}` | anon | -> 200 `UserProfileDto` | 404 unknown/deleted/blocked either way; private non-follower = 200 same field set | `user-service.fetchUser` (mock) |
| `GET /api/users/by-username/{username}` | anon | -> 200 `UserProfileDto` | case-insensitive; 404 as above; 400 over 30 chars | `fetchUserByUsername`, route `/[@username]` |
| `GET /api/users/{id}/followers` | anon | `?page&pageSize(20)&query` -> 200 `FollowListPageDto` | accepted edges only, newest first; private non-permitted = 200 `locked: true` (`totalCount` 0); 404 blocked/deleted; `query` <= 50 chars (username or display name, case & diacritics insensitive) | `fetchFollowList` |
| `GET /api/users/{id}/following` | anon | same as followers | same | `fetchFollowList` |
| `GET /api/users/me/follow-requests` | JWT | `?page&pageSize(20)&query` -> 200 `FollowListPageDto` (`locked` false) | pending requests, newest first, deleted/blocked requesters excluded before paging; 401 | `fetchFollowRequests` |
| `GET /api/users/me/follow-requests/count` | JWT | -> 200 `{count}` | same filter as list | `fetchFollowRequestCount` |
| `GET /api/users/me/relation-sets` | JWT | -> 200 `RelationSetsDto` | `blocked`, `muted`, `closeFriends` (dormant flags included), `isPrivate`, `requestCount`; no `blockedBy` | `fetchRelationSets`, `fetchCloseFriendCandidates` |
| `GET /api/users/me/blocks` | JWT | `?page&pageSize(20)` -> 200 `PagedResponse<UserProfileDto>` (items `isBlocked: true`, no `locked`) | newest block first; deleted users omitted | `fetchBlockedUsers` |
| `GET /api/users/me/mutes` | JWT | `?page&pageSize(20)&query` -> 200 `PagedResponse<UserProfileDto>` (items `isMuted: true`) | newest mute first (`MutedAt`); dormant mutes included; blocked/deleted users excluded BEFORE paging & `totalCount`; `query` <= 50 chars (relation search rule); 400 bad paging; 401 | `fetchMutedUsers` |
| `PUT /api/users/profiles/me/privacy` | JWT | `{isPrivate}` -> 200 `{acceptedCount}` | going public accepts ONLY pending requests (count = transitions); going private/same value -> 0 | `setPrivateAccount` |
| `PUT /api/users/profiles/me` | JWT | `{displayName, bio?, avatarUrl?, coverUrl?, gender(0..3), dateOfBirth?}` -> 200 `UserProfileDto` | edits JWT profile; 400 `ValidationFailed` / `ProfileFieldInvalid`; no username/email/privacy; urls are plain strings (no upload API) | `updateProfile` (mock) |
| `PUT /api/users/profiles/switch` | JWT | `{profileId, refreshToken}` -> 200 `LoginResponse` | rotates refresh token, new JWT; 403 `ProfileNotOwned` (foreign/deleted/unknown profile); 401 `InvalidRefreshToken` | profile switcher (roadmap 2.7) |
| `PATCH /api/users/profiles/{id}/default` | JWT | -> 204 | 403 `ProfileNotOwned`; 400 `AccountRequiresProfile` | none |
| `DELETE /api/users/profiles/{id}` | JWT | -> 204 | 404 foreign/unknown; 400 `CannotDeleteDefaultProfile` / `AccountRequiresProfile` | none |


### 2.3 Posts (`PostsController`)

| Endpoint | Auth | Request -> success | Errors / constraints | FE counterpart |
|---|---|---|---|---|
| `GET /api/posts/{id}` | anon | -> 200 `PostDto` | 404 unknown/deleted/hidden/blocked either way; viewer flags false for anonymous | `post-service.fetchPostThread` (via threads) |
| `POST /api/posts` | JWT | `{content(<=2000), imageUrl?(abs http(s), <=2048)}` -> 201 `PostDto` + `Location: /api/posts/{id}` | text-only allowed; 400 `ValidationFailed`; single image URL only, no upload; no visibility/audience input (always `public`) | `createPost` + `PostCreatorCore` (mock; multi-image & audience not supported) |
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
| `POST /api/likes/toggle` | handler | `{targetId, targetType: 1 post \| 2 comment}` -> 200 `{isLiked}` | DEPRECATED (toggle flips on retry; remove after FE CP2); same 404 guard; null `targetType` -> 400 `ValidationFailed` | - |
| `POST /api/saveditems/toggle` | handler | `{targetId, targetType}` -> 200 `{isSaved}` | DEPRECATED, same | - |
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
| `GET /api/notifications` | JWT | `?page&pageSize(20)` -> 200 `NotificationPageDto` | newest first; notifications of blocked/deleted senders excluded BEFORE paging, `totalCount` & `unreadCount`; 400 bad paging; 401 | `/notifications` list (inline mock `INITIAL_NOTIFICATIONS`) |
| `GET /api/notifications/unread-count` | JWT | -> 200 `{count}` | same sender filter as list | unread badge |
| `PUT /api/notifications/{id}/read` | JWT | no body -> 204 | idempotent; 403 `NotNotificationRecipient` (foreign notification); 404 unknown; 401 | item click |
| `PUT /api/notifications/read-all` | JWT | no body -> 204 | idempotent; marks only own | "mark all read" |

| Item | Actual | FE counterpart |
|---|---|---|
| Hub auth | `[Authorize]`, token via `access_token` query; connection user = `user_id` | `signalr-client.ts`: WebSockets, `skipNegotiation`, `accessTokenFactory` (compatible) |
| Event | `ReceiveNotification` with 1 `NotificationDto` (same item shape as list) | FE `NotificationPayload` in `signalr-client.ts` expects `message`, `createdAt`, `isRead`, `senderName`, `senderAvatar`, `targetId`: all present; FE type union must add `NewFollow`, `FollowRequested`, `FollowAccepted`, `NewComment`, `NewLike` (`kind` gives FE list grouping like \| reply \| follow) |
| Types | `NewLike`, `NewComment`, `NewFollow` (public follow, notifies followed user), `FollowRequested`, `FollowAccepted` (notifies REQUESTER) | FE `NotificationKind` like \| follow \| reply = `kind` |
| Self events | no notification (self like, self comment) | - |
| Persistence | in-memory; delivered outbox messages removed; lost on restart; push reaches only active profile connection | - |

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
NotificationPageDto: PagedResponse<NotificationDto> + { unreadCount }
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
| Like / bookmark | Done | idempotent PUT/DELETE routes; toggles deprecated |
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
| Profile switcher | Done | `GET me` + `PUT profiles/switch` (replace both tokens, reset viewer stores) |
| Settings: sessions, language, deactivate | Unsupported | delete account exists |
| DMs, report, onboarding | Unsupported | no code |

## 5. Integration risks (status 2026-10-16)

- **Closed:** error shapes & 500s, text-only post, logout/refresh/session cap, event dispatch, identity (`user_id`, username), read endpoints, privacy/block enforcement, toggle vs set routes, response codes, SignalR payload, security hardening; history in plan T1-T4
- **Open (FE side):** cross-tab refresh single-flight & redirect fix (CP1, §1), FE notification type union (§6), toggle removal after CP2
- **Open (BE, accepted):** in-memory store, no transactions, restart wipes state (deterministic seed ids; FE treats refresh 401 as logout); full register: BG §10

## 6. FE checkpoints & follow-ups

> FE adoption plan & phase progress: `../../features/fe-be-integration-roadmap.md` (post delete moves CP1 -> Phase C). FE work is out of scope of recovery; CP = BE contract frozen for slice + test evidence. FE never consumes slice before its CP; mocks stay for everything else

| CP | Slice unblocked | BE state |
|---|---|---|
| CP0 | FE plumbing: base URL, ProblemDetails normalizer (`code` switch), JWT `user_id` decoder, login redirect `/login` | reached (tests); FE adopted (Phase F) |
| CP1 | auth (login, register with username, forgot/reset, logout, silent refresh), post delete | reached (tests); manual login -> refresh -> logout smoke verified 2026-10-15 (BG §12); FE auth adopted (Phase F), post delete moves to FE Phase C |
| CP2 | profile header & edit, switcher (`GET me`), post create/edit, post detail + thread, profile threads tab, saved page, like/bookmark | FE adopted (Phase C, follow & feed read moved here); reached (tests, swagger verified) |
| CP3 | private account, follow requests, followers dialog, block list, close friends | FE adopted (Phase G); reached (tests, swagger regenerated) |
| CP4 | feed, notifications, mute | reached (tests, swagger regenerated); FE slices not adopted yet |

### FE follow-ups (record in FE roadmap; NOT done here)
- **CP1 (required):** DONE (FE Phase F): cross-tab refresh single-flight (§1: `navigator.locks` + rotation adoption), redirect `/login`, register sends `username`
- **CP2 (DONE, FE Phase C except: switcher, toggle endpoints still BE-side):** viewer bootstrap from `MeDto`, never expect `email` on other profiles; follow status from `{followStatus}`; like/bookmark via `PUT`/`DELETE` resource routes (route by `kind`); thread via `/api/threads/{id}`; accept `null` for nullable DTO fields (not only absent); map `visibility` `followersOnly|private` (not produced yet); remove toggle endpoint usage
- **CP2/CP3 (D14, DONE FE Phase G):** blocked profile = not-found state; `isBlockedBy` forced false & `blockedBy` always empty in real mode (mock keeps its model); unblock only from own block list (`me/blocks` has no `query`: FE filters locally, M20)
- **CP3 (DONE FE Phase G):** `FollowListPageDto.locked` renders locked state in followers dialog
- **CP4:** `fetchFeed` via `GET /api/feed` (`tab`, `page`; `nextPage` from `hasNextPage`; `following` needs token); `setMuted`/`fetchMutedUsers` via mute routes & `me/mutes`; notifications: list/unread/read routes, extend `NotificationPayload.type` union (`NewFollow`, `FollowRequested`, `FollowAccepted`), map `kind` to item icon, `targetId` to link; share link: use `sharedUrl` as is

## 7. Contract decisions (D-ids, owner of outcome; rationale: plan §4)

| D | Decision (contract) | Status |
|---|---|---|
| D1, D2 | ProblemDetails + stable `code` catalog (§1.1), codes independent of class names | Implemented (T1.1a/b) |
| D3 | Login failure: uniform 401 `InvalidCredentials`; 403 `AccountInactive` only after valid password | Implemented |
| D4 | Session cap 5; 6th login evicts oldest, no error | Implemented |
| D5 | Refresh `POST /api/identities/refresh-token`, rotation, profile-bound token, 401 `InvalidRefreshToken` | Implemented |
| D6 | Access 15 min, refresh 7 days; no per-request revocation; per-account session lock; FE cross-tab single-flight required | Implemented (BE) / FE open |
| D7 | Write responses: 201 `PostDto` + `Location`, 200 `PostDto`/`UserProfileDto` on update, 204 no payload, register 201 `{accountId}` | Implemented |
| D8 | Follow response `{followStatus}` | Implemented |
| D9 | Read DTO enums = lowercase-camel strings; request bodies keep ints | Implemented |
| D10 | Idempotent PUT/DELETE like/bookmark routes (no body); toggles kept until FE CP2 | Implemented |
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

- **Still open:** media upload URL shape, feed ranking (`forYou` chronological), notification reply preview, access-token revocation, audience `CloseFriends`, toggle removal, search/tags/trending; full register: BG §10

## 8. Evidence
- Probes of original behavior (T0.2) & their current results: `../architecture/backend-guide.md` §12
- Contract regression suite: `tests/YSocial.Api.IntegrationTests` (418 tests; layers in `.context/features/backend-unit-test.md`)
