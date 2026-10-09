# Relationship Controls (2B) Implementation Plan

> **Agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`; execute task-by-task. Track steps via `- [x]`

- **Goal:** private account + follow requests (2.3), close friends (2.4), block / mute (2.5) on mocks, enforced by 1 visibility contract & managed from minimal `/settings`
- **Architecture:** `src/mocks/relation-graph` + `block-graph` + `privacy` = sole relation truth, read through `src/mocks/visibility` by every mock service before pagination. `features/profile` owns `relation-service` + `relation-store` (viewer-scoped optimistic projection, 1 `version` per viewer). `post-store` hides excluded authors instantly. Settings UI = new `features/settings`
- **Tech stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand 5, Tailwind v4, shadcn/Radix (`radix-ui`), Lucide, Vitest 4 + RTL + jsdom. NO new deps
- **Spec:** `docs/specs/2026-10-09-relationship-controls-design.md` (refs `D#` / `§#`). Executors read both
- All paths relative to `ysocial-clients/web-app/`. Branch: `feature/relationship-controls`

## Global Constraints

- NO BE/API calls; all data from `src/mocks/` + feature mock services
- Files `kebab-case`, components `PascalCase`, CRLF line endings, `import type` for type-only imports, sorted imports, `#region` in large files
- Domain types ONLY in `features/<feature>/types/index.ts`; cross-feature imports ONLY via barrels, used at render/call time (never module top level)
- New feature edges allowed: `settings -> profile`, `settings -> auth`, `notifications -> profile`. `src/mocks/*` imports NO feature except `type` imports
- D9: guest = `GUEST_ACTOR_ID` (`"me"`) normalized to `null` by `asViewer`; every guest relationship mutation throws `ForbiddenError` (`@/lib/errors`)
- Strings via `useTranslation()`; flat keys in BOTH `src/lib/locales/vi.json` & `en.json` + `TranslationKey` union; NO `any` / `as any` in new/touched files
- Touch targets >= 44px; icon-only buttons `aria-label`; transitions 150-300ms + `motion-reduce:*`; NO `hover:scale-*`
- Store updates touching >1 entity of 1 store in 1 `set()`
- Tests: fake timers + `settle()` for services; `beforeEach` resets `__resetRelationGraph()`, `__resetBlockGraph()`, `__resetPrivacy()`, `__resetMockUsers()`, `__resetMockDb()`, `resetUserStore()`, `resetRelationStore()`, `resetPostStore()`
- Baseline (`main` @ `1e5a5c7`): see Appendix A; NO file/rule eslint count may increase; tests & typecheck green after every task
- Commits: Conventional Commits, author = user ONLY, NO `Co-Authored-By` trailer

## Review Focus

1. **Close-friends / private post via server metadata:** `/posts/[id]` `generateMetadata` uses `getMockPostById` on server; CF post or private-author post MUST get generic title (no content in OG). Pinned: Task 6 ("generic metadata for closeFriends & private author")
2. **Dormant close-friend flag after unfollow / block:** author unfollows viewer, viewer must NOT see CF posts. Pinned: Task 3 ("dormant flag not visible"), Task 1 ("reactivates after re-follow")
3. **Rapid Follow -> Requested -> cancel clicks on private profile:** final status = last click, counts never drift. Pinned: Task 7 ("follow then unfollow before first resolves -> final none")
4. **Account switch while `ensureRelationSets` in flight:** previous viewer's exclusions never hide posts for new viewer. Pinned: Task 9 ("ViewerSync stale result not applied")
5. **Mute + block same author, then unblock:** author stays out of feeds. Pinned: Task 8 ("mute + block then includeAuthor blocked -> still excluded")
6. **Failed block while unrelated mute in flight:** blocked state rolled back, mute kept. Pinned: Task 9 ("failed block rolled back despite unrelated mute")
7. **Request accepted by other account, then switch back to requester:** requester sees Following, not stuck Requested. Pinned: Task 9 ("projection invalidated on switch")
8. **Author blocked the viewer (reverse direction):** cached posts & later stream posts hidden. Pinned: Task 8 ("blockedBy author skipped by buffer"), Task 9 ("blockedBy -> excludedAuthors.blocked")
9. **Feeds page size after filtering:** private / blocked / CF authors never produce short pages while more visible posts exist. Pinned: Task 6 ("full page after filtering")

---

### Task 1: `relation-graph` (replaces `follow-graph`)

**Files:**
- Create: `src/mocks/relation-graph.ts`, `src/mocks/relation-graph.test.ts`
- Delete: `src/mocks/follow-graph.ts`, `src/mocks/follow-graph.test.ts` (port its cases)
- Modify: `src/features/profile/services/user-service.ts`, `src/features/posts/services/post-service.ts` (imports only), `src/mocks/seed-authors.ts`

**Interfaces:**
- Produces (`src/mocks/relation-graph.ts`):
  - `type FollowStatus = "none" | "pending" | "accepted"`; `interface RelationEdge { status: FollowStatus; isCloseFriend: boolean; isMuted: boolean }`
  - `getEdge(observer, target): RelationEdge` (default none/false/false, never undefined); `getFollowStatus(observer, target): FollowStatus`
  - `getFollowedIds(id): ReadonlySet<string>` (accepted), `getFollowerIds(id)`, `getRequestIds(id): string[]` (insertion order, newest first)
  - `getFollowerCount(id)`, `getFollowingCount(id)` (accepted only)
  - `requestFollow(observer, target, targetPrivate: boolean): FollowStatus`, `removeFollow(observer, target): void`
  - `setCloseFriend(observer, target, on): void` (throws `Error("Close friend requires accepted follow")` unless accepted), `setMutedEdge(observer, target, on): void`
  - `acceptRequest(observer, target): void`, `acceptAllRequests(target): number`
  - `getCloseFriendIds(observer): string[]` (accepted & flag), `getMutedIds(observer): string[]`
  - `__resetRelationGraph(): void`
- Produces (`seed-authors.ts`): `SEED_FOLLOWING["author-03"]` gains `"1"`; `SEED_CLOSE_FRIENDS: Readonly<Record<string, readonly string[]>> = { "author-03": ["1"], "1": ["author-03"] }`
- Seed pending lives in `relation-graph.ts` (needs fans, avoids `seed-authors <-> seed-fans` cycle): `SEED_PENDING` (target -> requesters) = `{ "1": ["author-02", "author-08", ...SEED_FAN_FOLLOWS["author-01"].slice(0, 2)], "author-05": ["1"] }`

- [x] **Step 1: Failing tests** (`relation-graph.test.ts`): ported follow-graph cases (counts, self ignored, lazy viewer default) + `requestFollow(a, b, false)` -> `"accepted"`, follower count +1; `requestFollow(a, b, true)` -> `"pending"`, follower count unchanged, `getRequestIds(b)` contains `a`; repeated `requestFollow` idempotent (no count change); `removeFollow` from pending clears request; `setCloseFriend` on pending throws; `setCloseFriend(a,b,true)` then `removeFollow(a,b)` -> `getCloseFriendIds(a)` excludes `b`, `getEdge(a,b).isCloseFriend === true`; re-`requestFollow(a,b,false)` -> `getCloseFriendIds(a)` includes `b`; `acceptAllRequests(b)` with 3 pending -> returns 3, follower count +3, `getRequestIds(b)` empty; seed: `getFollowStatus("1","author-05") === "pending"`, `getCloseFriendIds("author-03")` = `["1"]`
- [x] **Step 2:** `npm run test -- relation-graph` -> FAIL (module missing)
- [x] **Step 3:** Implement with internal `writeEdge(observer, target, patch: Partial<RelationEdge>)` as ONLY mutation (updates `edges`, `followers`, `requests`; self no-op). Seed: `SEED_FOLLOWING` + fans accepted, `SEED_PENDING` pending, `SEED_CLOSE_FRIENDS` flags. Repoint `user-service` & `post-service` imports (`getFollowedAuthorIds` -> `getFollowedIds`, `setFollowed(a,b,true)` -> `requestFollow(a,b,false)` / `removeFollow` until Task 4)
- [x] **Step 4:** `npm run test` all PASS (update seed-count assertions changed by `author-03 -> 1`); `npm run typecheck` 0
- [x] **Step 5:** Commit `feat(mocks): relation graph with follow status, close friends & mute`

### Task 2: `privacy` & `block-graph` mocks

**Files:**
- Create: `src/mocks/privacy.ts`, `src/mocks/privacy.test.ts`, `src/mocks/block-graph.ts`, `src/mocks/block-graph.test.ts`

**Interfaces:**
- Consumes: Task 1 `acceptAllRequests`, `removeFollow`
- Produces: `isPrivate(id): boolean`, `setPrivate(id, value): number` (returns accepted count when turning public, else 0), `SEED_PRIVATE_IDS = ["1", "author-05", "author-07"]`, `__resetPrivacy()`; `setBlocked(blocker, blocked, on): void`, `isBlocked(a, b)`, `isEitherBlocked(a, b)`, `getBlockedIds(id): string[]` (newest first), `__resetBlockGraph()`

- [x] **Step 1: Failing tests:** `isPrivate("author-07")` true, `isPrivate("author-01")` false; `setPrivate("1", false)` returns 4 & `getRequestIds("1")` empty; `setBlocked("1","author-03",true)` -> `getFollowStatus` both directions `"none"`, `getEdge("1","author-03").isCloseFriend` still true, `isEitherBlocked("author-03","1")` true; block clears pending both ways (`"1"` blocks `"author-02"` -> `getRequestIds("1")` excludes `author-02`); mute flag kept after block; `setBlocked("1","1",true)` no-op; unblock -> follow stays `"none"`
- [x] **Step 2:** `npm run test -- privacy block-graph` -> FAIL
- [x] **Step 3:** Implement (block: `removeFollow` both directions, set membership)
- [x] **Step 4:** tests PASS, typecheck 0
- [x] **Step 5:** Commit `feat(mocks): privacy settings & block graph`

### Task 3: `visibility` rules

**Files:**
- Create: `src/mocks/visibility.ts`, `src/mocks/visibility.test.ts`
- Modify: `src/features/posts/types/index.ts` (add `PostVisibility`, `PostItem.visibility?`, `CreatePostInput.visibility?`)

**Interfaces:**
- Consumes: Tasks 1-2. `src/mocks` cannot value-import `@/features/auth`: define exported `GUEST_ACTOR = "me"` in `visibility.ts`; test asserts `GUEST_ACTOR === GUEST_ACTOR_ID` (test files may import features)
- Produces: `type PostVisibility = "public" | "closeFriends"` (posts/types); `asViewer(actorId: string): string | null`; `canDiscoverUser(viewer: string | null, userId: string): boolean`; `canViewProfile(viewer, userId): boolean`; `isMarkedBy(authorId, viewer): boolean`; `canViewPost(viewer, post: Pick<PostItem, "user" | "visibility">): boolean`; `isMutedBy(viewer, authorId): boolean`

- [x] **Step 1: Failing table test** (`it.each`) rows: guest + public post -> true; guest + private author -> false; guest + CF post -> false; `"1"` + `author-07` post -> false; `"1"` + `author-03` CF post -> true; `"1"` + `author-02` CF post -> false; author self CF -> true; after `removeFollow("author-03","1")` CF post -> false (dormant); `"1"` blocked `author-01` -> `canViewPost` false & `canDiscoverUser` false; `author-01` blocked `"1"` -> same; `canDiscoverUser("1","author-07")` true (private discoverable); `asViewer("me") === null`; `GUEST_ACTOR === GUEST_ACTOR_ID`
- [x] **Step 2:** `npm run test -- visibility` -> FAIL
- [x] **Step 3:** Implement per spec §4.1
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(mocks): visibility rules for users & posts`

### Task 4: `user-service` follow commands, projection & discovery

**Files:**
- Modify: `src/features/profile/types/index.ts`, `src/features/profile/services/user-service.ts`, `user-service.test.ts`, `src/features/profile/index.ts`

**Interfaces:**
- Produces (types): `FollowStatus` re-declared in `profile/types` as `"none" | "pending" | "accepted"` (same literal union as mocks); `UserProfile` adds `isPrivate: boolean`, `followStatus: FollowStatus`, `viewerMarkedCloseFriend: boolean`, `isMuted: boolean`, `isBlocked: boolean`, `isBlockedBy: boolean`; `UserProfileBase = Omit<UserProfile, ViewerField>` where `type ViewerField = "isFollowing" | "followStatus" | "viewerMarkedCloseFriend" | "isMuted" | "isBlocked" | "isBlockedBy"`; `class CannotBlockYourselfError extends Error` in `@/lib/errors`
- Produces (fns): `followUser(id, actorId): Promise<FollowStatus>`, `unfollowUser(id, actorId): Promise<void>` (replace `setFollow`, barrel updated); `searchUsers` / `fetchSuggestedUsers` / `fetchFollowList` filter listed users by `canDiscoverUser`; `fetchFollowList` returns `{ users: [] }` unless `canDiscoverUser(viewer, userId) && canViewProfile(viewer, userId)` (D27); `projectUser(user, actorId): UserProfile` exported for profile-internal use

- [x] **Step 1: Failing tests:** `followUser("author-07","1")` -> `"pending"`, `fetchUser("author-07","1").followersCount` unchanged; `followUser("author-01","1")` -> `"accepted"`; `followUser` by `"me"` -> rejects `ForbiddenError` (public & private target); follow when either blocked -> `ForbiddenError`; `unfollowUser("author-05","1")` clears pending; projection: `fetchUser("author-03","1")` has `viewerMarkedCloseFriend` true, `isPrivate` false; `searchUsers("huy","1")` includes `author-07`; after `setBlocked("1","author-07",true)` -> excluded from `searchUsers`, `fetchSuggestedUsers`, `fetchFollowList("author-01","followers")`; `fetchFollowList("author-01", ...)` empty when `"1"` blocked `author-01` AND when `author-01` blocked `"1"` (public profile, D27); `fetchUser` of blocked still returns with `isBlocked` true (profile needs blocked state)
- [x] **Step 2:** `npm run test -- user-service` -> FAIL
- [x] **Step 3:** Implement; writes apply graph synchronously BEFORE `mockDelay()`. Fix compile fallout in callers of `setFollow` minimally (store rewired in Task 7: temporary adapter in `user-store` calling `followUser` / `unfollowUser` by current flag)
- [x] **Step 4:** `npm run test` PASS (update tests that followed as guest `"me"` to use `"1"`), typecheck 0
- [x] **Step 5:** Commit `feat(profile): follow/unfollow commands with pending status & discovery rules`

### Task 5: `relation-service`

**Files:**
- Create: `src/features/profile/services/relation-service.ts`, `relation-service.test.ts`
- Modify: `src/features/profile/types/index.ts`, `src/features/profile/index.ts`

**Interfaces:**
- Consumes: Tasks 1-4
- Produces (types): `type RequestDecision = "accept" | "decline"`; `interface RelationSets { blocked: string[]; blockedBy: string[]; muted: string[]; closeFriends: string[]; isPrivate: boolean; requestCount: number }`; `interface RelationListQuery { query?: string; page?: number }`; `RELATION_PAGE_SIZE = 20`; list result reuses `FollowListPage`
- Produces (fns, all `actorId` last): `setBlocked(id, on, actorId): Promise<void>` (self -> `CannotBlockYourselfError`), `setMuted(id, on, actorId): Promise<void>`, `setCloseFriend(id, on, actorId): Promise<void>`, `setPrivateAccount(on, actorId): Promise<{ acceptedCount: number }>`, `fetchFollowRequests(q, actorId)`, `fetchFollowRequestCount(actorId): Promise<number>`, `respondFollowRequest(requesterId, decision, actorId): Promise<void>`, `fetchBlockedUsers(q, actorId)`, `fetchMutedUsers(q, actorId)`, `fetchCloseFriendCandidates(q, actorId)`, `fetchRelationSets(actorId): Promise<RelationSets>`

- [x] **Step 1: Failing tests:** every write by `"me"` rejects `ForbiddenError`; `setBlocked("1","1",true,"1")` rejects `CannotBlockYourselfError`; `fetchRelationSets("1")` = `{ blocked: [], blockedBy: [], muted: [], closeFriends: ["author-03"], isPrivate: true, requestCount: 4 }`; after `setBlocked("author-01","1",true)` (graph) -> `blockedBy: ["author-01"]`; `respondFollowRequest("author-02","accept","1")` -> `getFollowStatus("author-02","1") === "accepted"`, count 3; `decline` -> `"none"`; `respondFollowRequest` for non-requester rejects; `setPrivateAccount(false,"1")` -> `{ acceptedCount: 4 }`; `setCloseFriend("author-07",true,"1")` rejects (not accepted); `fetchCloseFriendCandidates({},"1")` lists accepted followees with flag projected; `fetchFollowRequests({ query: "elena" },"1")` filters; paging returns `nextPage` at 20
- [x] **Step 2:** `npm run test -- relation-service` -> FAIL
- [x] **Step 3:** Implement; projection via Task 4 `projectUser`
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(profile): relation service for block, mute, close friends, privacy & requests`

### Task 6: `post-service` visibility filtering

**Files:**
- Modify: `src/features/posts/services/post-service.ts`, `post-service.test.ts`, `src/features/posts/mocks/mock-posts.ts`, `src/features/posts/types/index.ts` (`UserPostsPage.locked: boolean`), callers: `src/features/profile/hooks/use-profile-tab-posts.tsx`, `src/features/search/services/search-service.ts`, `src/features/search/components/tag-container.tsx`, `src/features/posts/components/detail/post-detail-container.tsx`, `src/app/posts/[id]/page.tsx` (+ their tests)

**Interfaces:**
- Consumes: Task 3
- Produces: `fetchUserPosts(userId, tab, page, actorId)`, `searchPosts(query, actorId, limit?, sort?)`, `fetchPostsByTag(tag, sort, actorId)`, `fetchPostThread(id, actorId)`; `fetchFeed` & `fetchSavedPosts` filter; `createPost` stores `input.visibility` when `"closeFriends"`; `isPostPubliclyVisible(post: PostItem): boolean` (= `canViewPost(null, post)`, exported via posts barrel for metadata)
- Seeds (`mock-posts.ts`, `RawPost.visibility?`): 2 new CF roots by `author-03` (index 2) `post-cf-01`, `post-cf-02`; 1 CF root by `author-02` (index 1) `post-cf-03`

- [x] **Step 1: Failing tests:** `fetchFeed("forYou",1,"1")` excludes `author-07` & `post-cf-03`, includes `post-cf-01`; feed returns exactly `FEED_PAGE_SIZE` posts on page 1 while more visible exist; guest feed excludes all CF & private; muted author excluded from both feeds but present in `fetchUserPosts`; `fetchUserPosts("author-07","threads",1,"1")` -> `{ posts: [], locked: true }`; own private profile not locked; `fetchPostThread("post-cf-03","1")` -> `null`; thread replies by blocked author filtered; `searchPosts` & `fetchPostsByTag` exclude invisible; stream generates only public posts by non-private authors (spy `listener` over 20 ticks); `createPost({ ..., visibility: "closeFriends" })` -> stored & invisible to non-marked viewer; `isPostPubliclyVisible(post-cf-01)` false
- [x] **Step 2:** `npm run test -- post-service` -> FAIL
- [x] **Step 3:** Implement: filter BEFORE `pageOf`/slice; stream picks from `SEED_AUTHORS.filter((a) => !isPrivate(a.id))`. Update callers to pass `actorId` (`useActorId()` / existing param). `posts/[id]/page.tsx` `generateMetadata`: `!isPostPubliclyVisible(post)` -> same generic metadata as unknown post
- [x] **Step 4:** `npm run test` PASS (fix count/order assertions shifted by private seeds), typecheck 0
- [x] **Step 5:** Commit `feat(posts): enforce visibility in post queries & metadata`

### Task 7: `user-store` follow status + `FollowButton` states

**Files:**
- Modify: `src/features/profile/types/index.ts` (`ViewerFollows.status`), `src/features/profile/store/user-store.ts`, `user-store.test.ts`, `src/features/profile/components/follow-button.tsx`, `follow-button.test.tsx`, `user-hover-card.tsx`, `src/features/profile/index.ts`

**Interfaces:**
- Consumes: Task 4 `followUser` / `unfollowUser`
- Produces: `ViewerFollows { status: Record<string, "pending" | "accepted">; known; loaded; version }`; action `setFollowStatus(actorId, id, next: FollowStatus)` (replaces `toggleFollow`); action `clearViewerFollows(actorId)` (drops that viewer's projection: `status`, `known`, `loaded`; bumps `version` so in-flight graph loads are discarded); `useFollowState(id): FollowStatus | undefined`; `useFollowedIds` accepted only; `commitFollow(actorId, id, next: "follow" | "unfollow"): Promise<boolean>`
- `FollowButton` labels: `card.follow`, `relations.requested`, `card.following`; Unblock branch added in Task 9

- [x] **Step 1: Failing tests:** `setFollowStatus(a,"author-07","pending")` -> followers count unchanged; `none -> accepted` +1, `accepted -> pending` -1 (never double); `commitFollow(a,"author-07","follow")` optimistic `"pending"`, service `"pending"` kept; `commitFollow(a,id,"unfollow")` optimistic `"none"`; stale reconcile ignored: follow then unfollow before first resolves -> final `"none"` & counts equal graph; `useFollowedIds` excludes pending; FollowButton: renders "Requested" for pending, click -> `unfollow` without confirm dialog; guest click -> `router.push("/login")`, no service call; `clearViewerFollows(a)` -> `useFollowState` undefined & in-flight `ensureFollowGraph(a)` result discarded
- [x] **Step 2:** `npm run test -- user-store follow-button` -> FAIL
- [x] **Step 3:** Implement; optimistic `follow` status = `users[id].isPrivate ? "pending" : "accepted"`; remove Task 4 adapter
- [x] **Step 4:** `npm run test` PASS, typecheck 0
- [x] **Step 5:** Commit `feat(profile): pending follow status in user store & follow button`

### Task 8: `post-store` author exclusion

**Files:**
- Modify: `src/features/posts/store/post-store.ts`, `post-store.test.ts`, `src/features/posts/index.ts`, `src/features/posts/components/post-card.tsx` (blocked null guard), `src/features/posts/hooks/use-pending-feed.ts` (skip excluded)

**Interfaces:**
- Produces: `type ExclusionReason = "muted" | "blocked"`; state `excludedAuthors: Record<string, Partial<Record<ExclusionReason, true>>>`; actions `excludeAuthor(id, reason)`, `includeAuthor(id, reason)`, `setExcludedAuthors(map)`, `resetViewerFeeds()`; selector `useIsAuthorBlocked(id)`; all exported via posts barrel

- [x] **Step 1: Failing tests:** `excludeAuthor(a,"muted")` removes a's ids from both `feedIds` & `incoming`, keeps replies; `excludeAuthor(a,"blocked")` also removes from `replyIds`; mute + block then `includeAuthor(a,"blocked")` -> still excluded (muted); `bufferIncoming` & `setFeedPage` skip excluded; `resetViewerFeeds` clears feed state & exclusions, keeps `posts`; `PostCard` renders null for blocked author; `getPendingFeed` skips excluded authors; blockedBy author (`excludeAuthor(a,"blocked")` set from `blockedBy`) skipped by buffer: stream post arriving after exclusion never enters `incoming`
- [x] **Step 2:** `npm run test -- post-store post-card pending-feed` -> FAIL
- [x] **Step 3:** Implement
- [x] **Step 4:** `npm run test` PASS, typecheck 0
- [x] **Step 5:** Commit `feat(posts): author exclusion with per-reason tracking`

### Task 9: `relation-store`, commit helpers & viewer switch

**Files:**
- Create: `src/features/profile/store/relation-store.ts`, `relation-store.test.ts`
- Modify: `src/features/profile/index.ts`, `follow-button.tsx` (Unblock branch), `follow-button.test.tsx`, `viewer-sync.tsx`, `viewer-sync.test.tsx`

**Interfaces:**
- Consumes: Task 5 services, Task 7 `setFollowStatus`, Task 8 `excludeAuthor` / `includeAuthor` / `setExcludedAuthors` / `resetViewerFeeds` via posts barrel
- Produces: `interface ViewerRelations { blocked: Record<string, true>; blockedBy: Record<string, true>; muted: Record<string, true>; closeFriends: Record<string, true>; isPrivate?: boolean; requestCount?: number; loaded: boolean; opVersion: Record<string, number>; mutationSeq: number }` (op key = target id, `"self"` for privacy, requester id for respond); `useRelationStore`, `resetRelationStore()`; module `viewerGeneration` + `bumpViewerGeneration(): number`; `ensureRelationSets(actorId, opts?: { force?: boolean }): Promise<void>` (discard result IF `mutationSeq` changed since start; apply to `post-store` `setExcludedAuthors` (blocked + blockedBy as `blocked`, muted as `muted`) ONLY IF generation unchanged); `invalidateViewerProjection(actorId): void` (`clearViewerFollows` + drop relation slot); `commitBlock(actorId, id, on): Promise<boolean>`, `commitMute(actorId, id, on): Promise<boolean>`, `commitCloseFriend(actorId, id, on): Promise<boolean>`, `commitPrivacy(actorId, on): Promise<{ ok: boolean; acceptedCount: number }>`, `commitRespondRequest(actorId, requesterId, decision): Promise<boolean>`, `refreshRequestCount(actorId): Promise<void>`; selectors `useIsBlocked(id)`, `useIsMuted(id)`, `useViewerMarkedCloseFriend(id)`, `useIsPrivateAccount()`, `useFollowRequestCount()`, `useRelationsLoaded()`; `ViewerSync` on actor change: `bumpViewerGeneration()`, `resetViewerFeeds()`, `invalidateViewerProjection(actorId)`, then `ensureRelationSets(actorId, { force: true })` (D25)

- [x] **Step 1: Failing tests:** `ensureRelationSets("1")` loads sets + `requestCount` 4; `commitBlock("1","author-03",true)` -> blocked set, user-store status `"none"` both cache entries, post-store `excludedAuthors["author-03"].blocked`; failed block while unrelated mute (other target) in flight -> block rolled back in all 3 stores (field-scoped: only fields still holding optimistic value), mute kept; same-target newer op (unblock) during block in flight -> block reconcile skipped; `ensureRelationSets` started before a mutation -> result discarded; A -> B -> A with A's first load in flight -> first result not applied to `post-store`; projection invalidated on switch: `"2"` requests private `"1"` (pending cached for `"2"`), switch to `"1"`, `commitRespondRequest("1","2","accept")`, switch back -> `"2"` `useFollowState("1") === "accepted"` after reload; blockedBy -> `excludedAuthors.blocked`; `commitRespondRequest(accept)` -> `requestCount` 3; `commitPrivacy(false)` -> `acceptedCount` 4, `requestCount` 0, own user refetched; block of pending requester refreshes count; guest helpers resolve false without service call; FollowButton blocked target shows Unblock; ViewerSync: actor `"1"` -> `"2"` while `"1"` sets in flight -> `"1"` result not applied to `post-store`, feeds reset once per switch
- [x] **Step 2:** `npm run test -- relation-store viewer-sync follow-button` -> FAIL
- [x] **Step 3:** Implement per D18: every commit bumps `opVersion[key]` + `mutationSeq`; reconcile only IF key version unchanged; failure -> field-scoped rollback (compare current value with op's optimistic value, never version)
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(profile): relation store, optimistic relation commits & viewer switch`

### Task 10: Block / mute from `PostCardMenu`

**Files:**
- Create: `src/features/profile/components/block-confirm-dialog.tsx`, `block-confirm-dialog.test.tsx`
- Modify: `src/features/posts/components/post-card-menu.tsx`, `post-card-menu.test.tsx`, `src/features/posts/components/detail/post-detail-container.tsx` (+ test), `src/features/profile/index.ts`, locales + `TranslationKey`

**Interfaces:**
- Consumes: Task 9 `commitBlock`, `commitMute`, `useIsMuted`, `useIsBlocked`
- Produces: `BlockConfirmDialog({ open, onOpenChange, username, onConfirm })`
- i18n: `relations.blockTitle` ("Chặn @{username}?" / "Block @{username}?"), `relations.blockDescription`, `relations.blockConfirm`, `relations.unblock`, `relations.blockedToast`, `relations.unblockedToast`, `relations.muteToast`, `relations.unmuteToast`, `relations.unmute`, `relations.undo`, `relations.actionError`

- [x] **Step 1: Failing tests:** viewer menu shows Mute & Block for signed-in, hidden for guest; Mute -> `commitMute(actor,id,true)` + toast with Undo action calling `commitMute(...,false)`; muted author menu shows Unmute; Block opens dialog, Cancel no call, Confirm -> `commitBlock(actor,id,true)`; failure -> error toast; detail page: blocking root author refetches thread (`useIsBlocked(rootAuthorId)` change) -> not-found state (D26)
- [x] **Step 2:** `npm run test -- post-card-menu block-confirm-dialog` -> FAIL
- [x] **Step 3:** Implement (replace current `card.muteToast` / `card.blockToast` placeholders; remove now-unused keys)
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(posts): block & mute from post menu`

### Task 11: Profile states & header menu

**Files:**
- Create: `src/features/profile/components/profile-header-menu.tsx`, `profile-locked-state.tsx` (+ tests)
- Modify: `profile-header.tsx`, `profile-container.tsx`, `profile-tab-panel.tsx`, `use-profile-tab-posts.tsx` (expose `locked`), `followers-dialog` trigger in header, tests

**Interfaces:**
- Consumes: Tasks 6-9
- Produces: `ProfileLockedState({ variant: "private" | "blocked" | "unavailable", username, onUnblock? })`; `ProfileHeaderMenu({ user })`
- i18n: `relations.privateTitle`, `relations.privateDescription`, `relations.blockedTitle`, `relations.unavailableTitle`, `relations.unavailableDescription`, `relations.addCloseFriend`, `relations.removeCloseFriend`, `relations.mute`, `relations.block`, `profile.privateBadge` (lock `aria-label`)

- [x] **Step 1: Failing tests:** `/@huyvo` as `"1"` -> locked private state, Follow button, counts visible, counts not clickable; `isBlocked` -> blocked variant with Unblock calling `commitBlock(...,false)`, no tabs; `isBlockedBy` -> unavailable variant, no follow button; own private profile shows lock icon with `aria-label`; header menu hidden on own profile & for guest; close-friend item only when `followStatus === "accepted"`; accept of follow (status -> accepted) unlocks tabs after refetch
- [x] **Step 2:** `npm run test -- profile` -> FAIL
- [x] **Step 3:** Implement; `ProfileView` picks state: blocked > blockedBy > locked > tabs
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(profile): private, blocked & unavailable profile states with header menu`

### Task 12: `RelationUserList` + blocked / muted lists

**Files:**
- Create: `src/features/profile/components/relation-user-list.tsx`, `blocked-user-list.tsx`, `muted-user-list.tsx` (+ tests)
- Modify: `src/features/profile/index.ts`, locales

**Interfaces:**
- Produces: `RelationUserList({ fetchPage: (q: RelationListQuery) => Promise<FollowListPage>, renderAction: (user: UserProfile) => ReactNode, emptyTitle: TranslationKey, emptyDescription: TranslationKey, searchLabel: TranslationKey, reloadKey?: number })` (debounce 300ms, "load more" button, skeleton 6 rows, error + retry, request-token guard); `BlockedUserList()`, `MutedUserList()` (row removed optimistically on Unblock / Unmute)
- i18n: `relations.searchPlaceholder`, `relations.loadMore`, `relations.blockedEmptyTitle`, `relations.blockedEmptyDescription`, `relations.mutedEmptyTitle`, `relations.mutedEmptyDescription`, `relations.retry`

- [x] **Step 1: Failing tests:** empty state; search debounced (1 call after typing 3 chars within 300ms); load more appends page 2; error then Retry refetches; stale response from previous query ignored; Unblock row -> `commitBlock(...,false)` & row gone; Unmute similar
- [x] **Step 2:** `npm run test -- relation-user-list blocked-user-list muted-user-list` -> FAIL
- [x] **Step 3:** Implement
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(profile): reusable relation user list with blocked & muted lists`

### Task 13: Follow requests & close-friends lists

**Files:**
- Create: `src/features/profile/components/follow-request-list.tsx`, `close-friends-list.tsx` (+ tests)
- Modify: `src/features/profile/index.ts`, locales

**Interfaces:**
- Consumes: Task 12 `RelationUserList`, Task 9 `commitRespondRequest`, `commitCloseFriend`, `useFollowRequestCount`
- Produces: `FollowRequestList()` (Confirm / Delete per row; reloads page 1 when `useFollowRequestCount()` changes from outside), `CloseFriendsList()` (toggle per row `aria-pressed`, header count "N bạn thân")
- i18n: `relations.requestsTitle`, `relations.confirm`, `relations.delete`, `relations.requestsEmptyTitle`, `relations.requestsEmptyDescription`, `relations.closeFriendsCount`, `relations.closeFriendsEmptyTitle`, `relations.closeFriendsEmptyDescription`, `relations.add`, `relations.remove`

- [x] **Step 1: Failing tests:** demo lists 4 requests; Confirm -> `commitRespondRequest(...,"accept")`, row gone, count 3; Delete -> `"decline"`; close friends lists accepted followees with `author-03` pressed; toggle calls `commitCloseFriend`; count header updates
- [x] **Step 2:** FAIL
- [x] **Step 3:** Implement
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(profile): follow request & close friends lists`

### Task 14: `/settings` shell & privacy page

**Files:**
- Create: `src/features/settings/{index.ts,components/settings-nav.tsx,settings-index.tsx,settings-page-header.tsx,privacy-settings.tsx,settings-guest-gate.tsx}` (+ tests), `src/app/settings/{layout.tsx,page.tsx}`, `src/app/settings/(sections)/{layout.tsx,privacy/page.tsx,blocked/page.tsx,muted/page.tsx,close-friends/page.tsx}`
- Modify: `src/components/layout/main-layout.tsx` (`aside?: React.ReactNode`, dropdown "Settings" link), `src/lib/constants/layout.ts` if needed, locales

**Interfaces:**
- Consumes: Tasks 12-13 lists, Task 9 `commitPrivacy`, `useIsPrivateAccount`, `useFollowRequestCount`
- Produces: `SETTINGS_SECTIONS = [{ href: "/settings/privacy", key: "settings.privacy", icon: Lock }, { "/settings/blocked", "settings.blocked", Ban }, { "/settings/muted", "settings.muted", VolumeX }, { "/settings/close-friends", "settings.closeFriends", Star }]`; `MainLayout({ children, aside })` (`aside` replaces `RightSidebar` on `lg+`)
- i18n: `settings.title`, `settings.privacy`, `settings.blocked`, `settings.muted`, `settings.closeFriends`, `settings.back`, `settings.privateAccount`, `settings.privateAccountDescription`, `settings.goPublicTitle`, `settings.goPublicDescription` ("{count} yêu cầu sẽ được tự động chấp nhận"), `settings.goPublicConfirm`, `settings.guestTitle`, `settings.guestCta`, `nav.settings`; metadata titles per page, `robots: { index: false }`

- [x] **Step 1: Failing tests:** `SettingsIndex` renders 4 links; section layout renders `SettingsNav` with `aria-current="page"` on active; `/settings` index page renders exactly 4 settings links (`getAllByRole("link")` filtered by `/settings/` href = 4) & no `SettingsNav`; root `app/settings/layout.tsx` renders NO navigation (metadata + guest gate only); `PrivacySettings`: switch reflects `isPrivate`; turning public with 4 requests opens dialog showing 4, confirm -> `commitPrivacy(false)`; turning private no dialog; guest -> guest gate with login link; `MainLayout` with `aside` renders aside instead of right sidebar
- [x] **Step 2:** FAIL
- [x] **Step 3:** Implement; privacy page renders `<PrivacySettings/>` + `<section id="requests"><FollowRequestList/></section>`
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(settings): settings shell with privacy, blocked, muted & close friends`

### Task 15: Follow requests banner in notifications

**Files:**
- Create: `src/features/profile/components/follow-requests-banner.tsx` (+ test)
- Modify: `src/features/notifications/components/notification-container.tsx`, `src/features/profile/index.ts`, locales

**Interfaces:**
- Consumes: `useFollowRequestCount`, `fetchFollowRequests` (first 3 avatars)
- Produces: `FollowRequestsBanner()` link to `/settings/privacy#requests`; returns null when count 0 / guest / not loaded
- i18n: `notifications.followRequests` ("{count} yêu cầu theo dõi" / "{count} follow requests"), `notifications.followRequestsHint`

- [x] **Step 1: Failing tests:** demo -> banner with count 4 & 3 avatars & correct href; count 0 -> null; guest -> null
- [x] **Step 2:** FAIL
- [x] **Step 3:** Implement; mount above `NotificationList`
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(notifications): follow requests banner`

### Task 16: Close-friends posting & badge

**Files:**
- Modify: `src/features/posts/components/post-creator-core.tsx`, `post-creator-dialog.tsx`, `post-creator-feed.tsx`, `post-feed.tsx`, `post-card.tsx` (+ tests), locales

**Interfaces:**
- Consumes: Task 6 `createPost` visibility
- Produces: `onPostSubmitted(content, images, audience, visibility: PostVisibility)`; composer state `visibility` (reset to `"public"` after submit & on draft load); chip `aria-pressed`, hidden for guest & reply mode
- i18n: `creator.closeFriends`, `creator.closeFriendsHint`, `card.closeFriends`

- [x] **Step 1: Failing tests:** toggle chip -> submit passes `"closeFriends"`; reply mode has no chip; guest no chip; `PostCard` with `visibility: "closeFriends"` renders avatar ring class `ring-emerald-500` + label `card.closeFriends`; public post no label
- [x] **Step 2:** FAIL
- [x] **Step 3:** Implement (Lucide `Star`)
- [x] **Step 4:** PASS, typecheck 0
- [x] **Step 5:** Commit `feat(posts): close friends posting & badge`

### Task 17: Verification & close-out

**Files:**
- Create: `.context/features/relationship-controls.md`
- Modify: `.context/features/frontend-roadmap.md` (2.3/2.4/2.5 `[x]`, Restrict deferred note, 2B done), `.context/features/profile.md` & `feed-post-interaction.md` (follow-graph -> relation-graph refs), `.context/conventions/frontend.md` (emerald semantic exception), `.context/INDEX.md`, this plan (`[x]`), spec status

- [x] **Step 1:** `npm run test` all PASS; `npm run typecheck` 0; `npx eslint src` per file/rule <= Appendix A
- [x] **Step 2:** Browser pane (`preview_start`): spec §10 flows; 375 / 768 / 1440, light & dark, keyboard focus on lists & dialogs; screenshots as proof
- [x] **Step 3:** Deferred minor triage (agentic rules §4.3), resolve "Resolve now" items, re-run Step 1
- [x] **Step 4:** Update docs listed above per `01-doc-standards.md`
- [x] **Step 5:** Commit `docs(relations): close out phase 2B`

---

## Appendix A - Baseline

- `main` @ `1e5a5c7` (2026-10-09): `npm run test` 56 files / 527 tests PASS; `npm run typecheck` exit 0; `npx eslint src` 55 errors / 17 warnings
- Per file / rule (path from `src/`):

| File | Rule | Count |
|---|---|---|
| `components/shared/safe-hydration.tsx` | `react-hooks/set-state-in-effect` | 1 E |
| `features/auth/components/login-form.tsx` | `@next/next/no-html-link-for-pages` / `no-img-element` / `no-unused-vars` | 1 E / 3 W / 2 W |
| `features/auth/components/register-form.tsx` | `@next/next/no-html-link-for-pages` | 1 E |
| `features/auth/types/index.ts` | `no-explicit-any` | 5 E |
| `features/notifications/components/notification-list.tsx` | `no-explicit-any` | 1 E |
| `features/posts/components/post-creator-core.tsx` | `no-img-element` / `no-explicit-any` / `no-unused-vars` | 2 W / 1 E / 1 W |
| `features/posts/components/post-creator-dialog.tsx` | `no-explicit-any` | 1 E |
| `features/posts/components/post-lightbox.tsx` | `no-img-element` | 1 W |
| `features/posts/components/post-media-grid.tsx` | `no-img-element` | 5 W |
| `features/posts/store/post-draft-store.ts` | `prefer-const` | 1 E |
| `features/saved/components/saved-command-bar.tsx` | `no-explicit-any` | 9 E |
| `features/saved/components/saved-list.tsx` | `no-explicit-any` / `no-unused-vars` | 22 E / 3 W |
| `hooks/use-mobile.ts` | `react-hooks/set-state-in-effect` | 1 E |
| `lib/api-client.ts` | `no-explicit-any` | 10 E |
| `lib/signalr-client.ts` | `no-explicit-any` | 1 E |

- Pre-existing errors in files touched by Task 16 (`post-creator-core.tsx`, `post-creator-dialog.tsx`) may stay (out of scope); new code in them adds none
