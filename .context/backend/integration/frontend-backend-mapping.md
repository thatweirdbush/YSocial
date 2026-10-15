---
module: FE <-> BE Integration Mapping
updated: 2026-10-14
contract: ysocial-clients/web-app/docs/swagger.json
fe-roadmap: .context/features/frontend-roadmap.md
---

# FE <-> BE MAPPING

- Execution semantics (pipeline, errors, auth, events): `../architecture/backend-guide.md` (cited as BG §n)
- Aggregates, rules & state machines: `../architecture/domain-model.md` (cited as DM §n)
- Swagger is NOT re-listed; only deltas between Swagger, implementation & FE needs are recorded
- Paths: BE = BE-repo-relative (`src/...`); FE = relative to `ysocial-clients/web-app/`

## 1. Ground truth for integrators

| Topic | Fact | Evidence |
|---|---|---|
| FE integration state | **No FE feature calls BE.** `src/lib/api-client.ts` & `src/lib/signalr-client.ts` have 0 importers; every `features/*/services/*.ts` is mock (`mockDelay`, `src/mocks/*`); only DTO types are imported from `src/lib/api/generated.ts` (request types only) | grep `api-client|apiClient|apiFetch|signalr-client` over `src` = only generated types |
| Swagger quality | success responses have no schema (`200 OK` only) -> response types must be hand-written; error schema `ProblemDetails` does not match real body; documented 400/403/404 often unreachable (BG §5.2) | `docs/swagger.json` vs `ApiController.cs` |
| Base URL | FE hard-codes `https://localhost:49895` in `api-client.ts` & `signalr-client.ts`; same origin is documented in `.context/conventions/00-agentic-rules.md` (BE API origin); BE forces HTTPS redirect | `Program.cs`, FE files |
| Auth header | `Authorization: Bearer <accessToken>`; SignalR via `?access_token=` | `Program.cs` `OnMessageReceived` |
| Actor id | decode JWT claim **`user_id`** (profile id) client-side; login body has no user info; `sub` = account id | `JwtProvider.cs`, `LoginResponse` |
| JSON | camelCase, enums as integers (in & out), ids as GUID strings; `DateTime` ISO UTC | BG §8 |
| Error body | handler errors `{title, detail, status, timestamp}`; framework 400 `ValidationProblemDetails`; bare string for null `TargetType`; empty body for 401/403/route-404; domain exceptions = 500 | BG §5 |
| Content type of follow result | `Ok(string)` -> raw string (`Accepted`/`Pending`, PascalCase), may be `text/plain` unless `Accept: application/json`; FE `handleResponse` tolerates both (`JSON.parse` fallback to text) | `FollowUser.cs`; `api-client.ts`; negotiation `Partially verified` |
| Pagination | only `GET /api/posts/user/{userId}`: `page` 1-based, `pageSize` default 10 (1..50 dead validator: queries skip `ValidationBehavior` -> no bounds), `PagedList{items,page,pageSize,totalCount,totalPages,hasNextPage,hasPreviousPage}` | `GetPostsByUserIdQuery.cs`, `PagedList.cs` |
| Id types | profile `UserId` everywhere (authors, targets); never AccountId except `RegisterAccount` result | DM §1 |

## 2. Endpoint matrix by feature

Legend per row: **Auth** = effective requirement (attribute / handler check). **Actual** vs **Swagger** statuses listed only where they differ. FE column = module & integration status (`mock` = FE works on mocks, BE not wired)

### 2.1 Identities (`IdentitiesController`)

| Endpoint | Auth | Request -> response (actual) | Actual vs Swagger / constraints | Impl | FE counterpart |
|---|---|---|---|---|---|
| `POST /api/identities/register` | - | `{email, password(>=6)}` -> 200 `AccountId` (GUID string) | Swagger "200 OK" untyped; duplicate email 409 (`Result.Conflict`); invalid email/short password = `ValidationException` -> **500**; username = email local part, **not chosen, not unique**; local part < 3 chars -> 500 + **orphan account** (BG §7.2); no tokens returned (login required next) | Implemented, defects | `features/auth/components/register-form.tsx` (mock) - FE collects `username` (>=3, pattern) which BE cannot accept |
| `POST /api/identities/login` | - | `{loginId, password, deviceId}` -> 200 `{accessToken, refreshToken, refreshTokenExpiry}` | `loginId` = email/phone/username; unknown account 400 "Invalid credentials."; **wrong password -> 500**; 6th active session -> 500; `deviceId` required | Implemented, defects | `login-form.tsx` multi-step identity->password (mock, `utils/mock-session.ts` cookie) |
| `POST /api/identities/logout` | none (handler: `IsAuthenticated`) | `{refreshToken}` -> never 204 | authenticated: **always 404** (`AccountId` built from `UserId`, BG §6.4); unauthenticated: 400; refresh token never revoked | Implemented, **broken** | not wired |
| `POST /api/identities/forgot-password` | - | `{loginId}` -> 204 | always 204 even if unknown; OTP only delivered to mock senders (logged); FE cannot receive | Implemented (mock delivery) | forgot flow in `login-form.tsx` (mock) |
| `POST /api/identities/reset-password` | - | `{loginId, otp(6), newPassword(>=6)}` -> 204 | unknown id 400; wrong/expired OTP, max attempts -> **500**; success revokes all refresh tokens | Implemented, defects | reset step (mock) |
| `DELETE /api/identities/account` | handler check (no attribute) | -> **200 `true`** | Swagger 200 untyped; soft-deletes account + profiles; existing JWT keeps working | Implemented | `settings` danger zone UI (not built) |
| `POST /api/identities/refresh-token` (FE calls it) | - | - | **Not found** in BE; FE 401 handler would get 404, `clearAuth`, then redirect to `/auth/login` (**FE route is `/login`**) | Not found | `api-client.ts` (unused) |

### 2.2 Users & profile (`UsersController`)

| Endpoint | Auth | Request -> response | Actual vs Swagger / constraints | Impl | FE counterpart |
|---|---|---|---|---|---|
| `PUT /api/users/profiles/me` | none (unchecked) | `{displayName, bio?, avatarUrl?, coverUrl?, gender(0..3), dateOfBirth?}` -> 200 `true` | edits **JWT profile**; no username/email/privacy; anonymous -> 404; violations (length, forbidden words, future DOB) -> 500 (validator) ; `avatarUrl/coverUrl` are plain strings (no upload API) | Implemented | `profile` edit dialog (mock `updateProfile`) |
| `PUT /api/users/profiles/switch` | none (unchecked) | `{profileId, refreshToken}` -> 200 `LoginResponse` | rotates refresh token + new JWT; bad token -> 500; needs valid access token in practice | Implemented | roadmap 2.7 (not started) |
| `PATCH /api/users/profiles/{id}/default` | none | -> 200 `true` | fails (500) when account has <= 1 profile | Implemented | none |
| `DELETE /api/users/profiles/{id}` | none | -> 200 `true` | cannot delete default/last (500) | Implemented | none |
| `GET /api/users/{id\|@username}` | - | - | Not found (no profile read; no `UserInfo` query; `GetByUsernameAsync` unused) | Not found | `user-service.fetchUser/fetchUserByUsername`, route `/[@username]` (mock) |
| create profile, privacy toggle, username change, followers/following lists, suggestions | - | - | Not found / domain only (`User.UpdatePrivacySettings`) | Not found | `profile`, `settings`, `relation-service.setPrivateAccount` |

### 2.3 Posts (`PostsController`)

| Endpoint | Auth | Request -> response | Actual vs Swagger / constraints | Impl | FE counterpart |
|---|---|---|---|---|---|
| `GET /api/posts/{id}` | - | -> 200 `PostInfo{id, content, imageUrl?, createdAt, authorId, authorName}` / 404 | `authorName` = **AuthorId as string** (placeholder); no counts, no viewer flags, no author profile, no visibility/privacy/block filter; deleted -> 404 | Partial | `post-service.fetchPostThread` (mock) |
| `POST /api/posts` | JWT | `{content, imageUrl?}` -> 200 `CreatePostResponse{postId, authorId, content, imageUrl, createdAt}` | Swagger 201/400 wrong; **`imageUrl` required by validator** (text-only post -> `ValidationException` -> 500); single image URL only, no upload endpoint; no visibility/allowComments input | Implemented, **defect** | `post-service.createPost` + `PostCreatorCore` (mock; supports text-only, multi-image, audience) |
| `PUT /api/posts/{id}` | JWT | `{content}` -> 200 `true` | non-author -> **500** (Swagger 403); text only (matches FE "edit text only") | Implemented | `updatePostContent` (mock) |
| `DELETE /api/posts/{id}` | JWT | -> 200 `true` | Swagger 204; soft-delete; non-author 500; repeat delete 404 | Implemented | `deletePost` (mock; FE has no undo, BE has restore) |
| `PUT /api/posts/{id}/restore` | JWT | -> 200 `true` | author only; not-deleted -> 500; saved items not restored | Implemented (extra) | - |
| `GET /api/posts/user/{userId}` | - | `?page&pageSize` -> 200 `PagedList<PostInfo>` | `userId` = **profile id** (not username); newest first; offset paging; no `replies/media/saved` tabs; no visibility/private/block filter; excludes deleted | Partial | `fetchUserPosts(userId, tab, page, actorId)` (mock; tabs threads/replies/media) |
| `POST /api/posts/{id}/share-link` | JWT | `?username=` (required) -> 200 `{postId, sharedUrl}` | Swagger 404 **never returned** (no post lookup); URL = `{App:FrontendUrl or https://ysocial.com}/@{username}/post/{id}` (lowercased) while FE routes are `/posts/[id]` & `/@username` only (no `/@u/post/id` route) | Implemented, mismatch | share actions in `PostCard`/profile share (client-built links) |
| feed / timeline, search, trending, tags, pin, hide-like-count, multi-image, media upload, drafts | - | - | Not found | Not found | `fetchFeed`, `searchPosts`, `fetchPostsByTag`, `fetchTrendingTags`, `setPostPinned`, `setHideLikeCount` (mock) |

### 2.4 Comments (`CommentsController`) - FE models replies as posts

| Endpoint | Auth | Request -> response | Notes | Impl | FE counterpart |
|---|---|---|---|---|---|
| `POST /api/comments` | handler check -> 401 body | `{postId, content, parentCommentId?}` -> 200 GUID | `Guid.Empty` parent normalized to null; parent post-membership not checked; unbounded nesting; notifies post author (also self) | Implemented | `createReply(parentId, ...)` (mock: reply = `PostItem.parentId`) |
| `PUT /api/comments/{id}` | handler check | `{content}` -> 200 `true` | author only (500 otherwise) | Implemented | none (FE edits via post edit) |
| `DELETE /api/comments/{id}` | handler check | -> 200 `true` | author or post owner; soft | Implemented | - |
| `PUT /api/comments/{id}/restore` | handler check | -> 200 `true` | only deleter, post alive | Implemented | - |
| `GET` comments by post / by id | - | - | **Not found** -> thread can't be rendered | Not found | `fetchPostThread` (replies) |

### 2.5 Likes & saved (`LikesController`, `SavedItemsController`)

| Endpoint | Auth | Request -> response | Notes | Impl | FE counterpart |
|---|---|---|---|---|---|
| `POST /api/likes/toggle` | handler check | `{targetId, targetType: 1 post \| 2 comment}` -> 200 `{isLiked}` | **toggle, not set**: retry flips; strings for `targetType` rejected; unlike never decrements `likeCount` (BG §7.2); `likeCount` not returned anywhere except `SavedPostResponse` | Implemented, defect | `setPostLike(id, liked)` + optimistic `post-store` (mock) |
| `POST /api/saveditems/toggle` | handler check | `{targetId, targetType}` -> 200 `{isSaved}` | toggle; comments savable but not listable | Implemented | `setPostBookmark(id, bookmarked)` |
| `GET /api/saveditems/posts` | handler check | -> 200 `SavedPostResponse[]{id, authorId, content, imageUrl, createdAt, likeCount, savedCount}` | **no pagination, no collections/ordering control** (newest saved first), N+1 lookups, no author data | Partial | `fetchSavedPosts(actorId, page)`, `/saved` (collections, drag sort, bulk unsave = FE-only) |

### 2.6 Social graph (`UserRelationsController`, `UserBlocksController`)

| Endpoint | Auth | Request -> response | Actual vs Swagger / constraints | Impl | FE counterpart |
|---|---|---|---|---|---|
| `POST /api/users/{targetId}/relations/follow` | JWT | -> 200 string `"Accepted"` or `"Pending"` | idempotent (returns current status); self/missing/deleted/blocked target -> **500** (Swagger 400/404); FE status type is lowercase `none\|pending\|accepted` -> map; `Pending` only if target private, but privacy is not settable (DM §5.1); follower counts never update (BG §7.2) | Implemented, defects | `followUser(id, actorId): FollowStatus` (mock) |
| `DELETE /api/users/{targetId}/relations/follow` | JWT | -> 204 | unfollow == cancel pending; no relation -> 204 | Implemented | `unfollowUser` |
| `PATCH /api/users/{targetId}/relations/close-friend` | JWT | `{isCloseFriend}` -> 204 | only while Accepted, else **500**; BE has no close friends list; FE keeps dormant flags (`closeFriends` set) -> semantics differ | Implemented | `setCloseFriend` |
| `POST /api/users/{targetId}/blocks` | JWT | -> 204 | idempotent; target existence unchecked; self -> 500 (FE expects `CannotBlockYourselfError`); **existing follows are NOT purged** (event not dispatched) | Implemented, defect | `setBlocked(id, true, actorId)` |
| `DELETE /api/users/{targetId}/blocks` | JWT | -> 204 | idempotent; follows not restored | Implemented | `setBlocked(id, false)` |
| accept / decline follow request, list requests/count, mute, list blocked / blockedBy / muted / close friends, followers / following lists | - | - | **Not found** (`AcceptFollow`, `ToggleMute` domain only) | Domain only / Not found | `respondFollowRequest`, `fetchFollowRequests`, `setMuted`, `fetchBlockedUsers`, `fetchRelationSets`, `fetchFollowList` |

### 2.7 Notifications (SignalR `/hubs/notifications`)

| Item | Actual | FE counterpart |
|---|---|---|
| Hub auth | `[Authorize]`, token via `access_token` query; connection user = `user_id` | `signalr-client.ts`: WebSockets, `skipNegotiation`, `accessTokenFactory` (compatible; unused) |
| Event | `ReceiveNotification` with `{id, type, title, content, metaData, recipientId}`; `type` in `NewLike\|NewComment\|FollowRequested\|FollowAccepted` | FE `NotificationPayload` expects `{message, createdAt, isRead, senderName, senderAvatar, targetId}` & type `NewFollow` -> **incompatible shape** (no sender name/avatar/createdAt/isRead in payload) |
| Live types | like & comment only; follow types never emitted (BG §7.2); self-events included | FE shows like/follow/reply list |
| HTTP list / unread count / mark read | **Not found** (`MarkNotificationAsReadCommand` has no controller) | `/notifications` page on inline mock `INITIAL_NOTIFICATIONS` |
| Persistence | in-memory outbox; lost on restart; recipient receives only on active profile connection | - |

## 3. FE requirement coverage

| FE requirement | BE status | Gap / decision needed |
|---|---|---|
| Login / register / forgot / reset | Partial | register needs `username` (BE derives it); text errors need exception mapping; OTP delivery mock |
| Session persistence / silent refresh / logout | Unsupported | no refresh endpoint, logout broken, 7-day access token |
| Feed (for-you / following tabs), new-posts pill | Unsupported | no feed endpoint; pill needs push (hub emits no post events) |
| Post detail + replies | Partial | no comments list; reply model differs (post vs comment) |
| Create post (text, multi-image, audience) | Partial / incompatible | text-only fails; 1 `imageUrl`; no upload; no visibility/audience input; no `allowComments` |
| Edit (text) / delete | Implemented | statuses differ from Swagger; no undo in FE vs restore in BE |
| Pin, hide like count, reposts, polls, drafts | Unsupported | no domain concept |
| Like / bookmark | Partial | toggle vs set; counts, `isLikedByCurrentUser` not in post reads |
| Saved page (collections, pagination, bulk unsave) | Partial | flat unpaged list; no collections |
| Search (users / posts / tags / suggestions), trending, `/tags/[tag]`, hashtags/mentions | Unsupported | no search, tag or mention model |
| Profile page (`/@username`: header, counts, tabs, `isFollowing`, followers dialog, share/QR) | Unsupported | no profile read, no counts (also never updated), no lists; share link route differs |
| Edit profile (name, bio, avatar, cover, gender, DOB) | Implemented | upload missing; 500 on validation; username/email not editable |
| Follow / unfollow, `FollowStatus` | Implemented, defective | PascalCase string; 500 for rule failures; counts frozen |
| Private account & follow requests (2.3) | Unsupported | privacy not settable; accept/decline absent |
| Close friends manager (2.4) | Partial | toggle only; no list; accepted-only rule -> 500 |
| Block (2.5) | Partial | block/unblock only; no lists; no `blockedBy`; no read-path enforcement; follows not purged |
| Mute (2.5), restrict | Unsupported | `ToggleMute` domain only |
| Visibility / viewer-scoped content rules (`visibility.ts`, `privacy.ts`) | Unsupported / incompatible | BE has `PostVisibility` (Public, FollowersOnly, Private) but never set or enforced; FE also uses close-friends audience (no BE value) |
| Notifications list, unread badge, mark read, filter tabs, realtime | Partial | only realtime push for like/comment; payload mismatch; no list/read API |
| Profile switcher (2.7) | Implemented | `switch` endpoint ready; needs refresh token client-side & actor reset |
| Settings: sessions, language, appearance, notifications settings, deactivate | Unsupported (FE-only or no BE) | delete account exists; deactivate/sessions not |
| DMs, report, onboarding | Unsupported | no code |

## 4. Highest-risk mismatches (ranked)

| # | Mismatch | Impact | Evidence |
|---|---|---|---|
| 1 | Domain/validation failures return **500**, not Swagger 400/403/404 | FE cannot distinguish forbidden/validation/not-found | BG §5.2 |
| 2 | Text-only post creation fails (`imageUrl` required) | core composer unusable | `CreatePost.cs` validator |
| 3 | Logout always 404; refresh endpoint absent; 7-day access token; 5-session cap | users locked out after 5 logins; FE silent refresh redirects to wrong route | BG §6.4; `api-client.ts` |
| 4 | Follow/block events never dispatched; unlike event lost | counts frozen, no follow notifications, blocks don't purge follows, like counts only rise | BG §7.2 |
| 5 | Identity: `sub` != `user_id`; login returns no user; routes expect profile id; username can't be chosen | wrong id used for follow/posts; register UI collects unusable username | DM §1 |
| 6 | No read endpoints for profile, feed, comments, lists, notifications; `PostInfo` has no counts/viewer flags/real author | FE screens have no data source | §2 |
| 7 | Post/profile reads ignore privacy, visibility & blocks; privacy not settable | FE viewer-scoped rules (`visibility.ts`, `block-graph.ts`) silently leak content if switched to BE | DM §8 |
| 8 | Toggle semantics (`like`, `saved`) vs FE set semantics | optimistic retry/rollback flips state; double-click race | §2.5 |
| 9 | Response codes differ (200 vs 201/204; `true` bodies) | strict status checks break | §2.3 |
| 10 | SignalR payload shape differs | notification UI renders blanks | §2.7 |
| 11 | Error body shapes (4) + Swagger `ProblemDetails` mismatch | generic error parser needed | BG §5 |
| 12 | Credentials/OTP/tokens in server logs; CORS any-origin with credentials | security review before real deployment | BG §3, §8 |

## 5. Integration risk notes by theme
- **Identity semantics:** store `userId` (from `user_id`) as actor; never send `sub`; after `switch`, replace both tokens & reset viewer-scoped stores; `RegisterAccount` returns useless account id for social routes
- **Follow states:** BE exposes `Accepted`/`Pending` only on follow response; `None` = absent; no read of current status; FE must persist what it gets; `Pending` is unreachable (privacy unsettable) -> FE private-account UX cannot be validated against BE
- **Privacy & visibility:** treat BE as public-only until enforcement exists; do not rely on BE to hide posts of private/blocked authors
- **Block:** one-directional state on BE; FE `isBlockedBy` needs new endpoint or must be dropped; blocking does not remove follows or content
- **Idempotency:** follow, unfollow, block, unblock, close-friend are idempotent; likes/saves are toggles; post delete is not idempotent (second call 404); comment delete same
- **Error handling:** normalize `status` + `detail ?? title ?? text`; treat 500 on write endpoints as potential business failure until BE maps exceptions; show generic fallback
- **Pagination:** single endpoint, offset-based; FE services use page numbers (`FEED_PAGE_SIZE=10`, `PROFILE_PAGE_SIZE=10`) = compatible with `page/pageSize` for user posts; no cursor; total count available
- **Cancellation/timeouts:** server ignores aborts on most routes; FE `AbortController` is cosmetic

## 6. Recommended integration order (dependency & risk)
1. **BE prerequisites (decisions §7):** exception -> `ProblemDetails` mapping; fix event scan (`UserRelations`, `UserBlocks`) & unlike event; fix logout; add refresh endpoint; relax `imageUrl`; align status codes with Swagger
2. **FE plumbing:** env-driven base URL, error normalizer (4 shapes), JWT `user_id` decoder, token store, correct login redirect
3. **Auth:** login -> register (decide username) -> forgot/reset -> logout/refresh
4. **Post writes:** create/edit/delete (+restore), like/save toggles (adapt UI to toggle or add set semantics)
5. **Post reads:** `GET /posts/{id}`, `GET /posts/user/{id}` (requires author enrichment + counts first, else cards render ids)
6. **Graph:** follow/unfollow/block/close-friend (status mapping) - keep counts/lists mocked until BE adds them
7. **New BE capabilities needed before FE swap:** profile read, feed, comments list, followers/following, follow requests, privacy toggle, notifications list/read, search
8. **Realtime:** SignalR after payload alignment & follow-event fix
9. **Last:** settings sessions, mute, DMs, reposts, polls

## 7. Unresolved contract decisions
> Proposed defaults & owner tasks: `../plans/2026-10-15-backend-recovery-&-fe-integration.md` §4 (D1-D20). Mark items decided here once approved
- Error envelope: RFC 7807 `ProblemDetails` everywhere? include `errors[]` for validation?
- Replies: BE `Comment` aggregate vs FE post-with-`parentId`; read model for threads
- Audience: add `CloseFriends` to `PostVisibility`? who may set it? enforcement point (query handlers)?
- Like/save: keep toggle, or add `PUT/DELETE` set semantics?
- Pagination: keep page/pageSize or move to cursor for feed/notifications?
- `blockedBy` exposure (privacy trade-off) & mute semantics
- Username: chosen at register? editable? uniqueness?
- Post read model: counts, viewer flags, author snapshot (`username`, `displayName`, `avatarUrl`)
- Refresh strategy: dedicated endpoint, access-token lifetime, revoke-on-logout
- Media: upload endpoint & URL shape for `imageUrl`/`avatarUrl`/`coverUrl`

## 8. Evidence limits & next probes

| Open point | Status | Probe |
|---|---|---|
| Real error status/format of domain exceptions | Partially verified | 1 `PUT /api/posts/{id}` as non-author |
| Follow response content type | Partially verified | `curl -i` with & without `Accept: application/json` |
| GUID JSON shape of `AccountId`/`PostId` in `CreatePostResponse`/register | Partially verified | 1 register + 1 create-post call |
| Port, launch profile, `appsettings` | Unverified | read redacted `launchSettings.json` & `appsettings.Development.json` |
| Event loss at runtime | Verified from source; not executed | follow user then check `FollowersCount` via debug log or test |
