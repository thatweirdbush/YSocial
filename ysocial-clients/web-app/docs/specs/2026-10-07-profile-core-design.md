# Profile Core - Design Spec

- **Date:** 2026-10-07
- **Status:** implemented 2026-10-08 (as-built: `.context/features/profile.md`); deviation: NO `loading.tsx` on `/@username` (it streams shell first, `notFound()` then answers HTTP 200); `not-found.tsx` is client component using `useTranslation`
- **Roadmap:** `.context/features/frontend-roadmap.md` -> Phase 2 sub-project **2A**: F0.6 (profile on mocks) + 2.1 (profile tabs) + 2.2 (followers/following) + 2.6 (share profile); also closes F0.4 for `/@username`, 7.7 for `/@username` & auth-store SSR hydration bug found during 2A
- **Scope rule:** FE ONLY. NO BE/API/DB calls in any new/touched flow; all data from in-repo mocks. After 2A, `features/profile` has ZERO `apiClient` imports. NO server-side fake DB (see D7 limitation)

## 1. Goal

- `/@username` works without BE: header, follow, edit (own), 4 tabs, followers/following dialog, share (link + QR)
- Profile reads same normalized caches as feed/search: follow, like, bookmark, pin & profile edits sync everywhere
- Route-level 404 (real status) for unknown usernames, incl. current session's runtime-registered user resolved on server
- Auth state hydrates SSR-safely; guest identity is explicit (`viewerId = null`), not disguised as user

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Followers/following UX | Keep `FollowersDialog` (no `/@username/followers` routes). Deviation from roadmap 2.2 "route/alongside" accepted |
| D2 | Viewer in mock DB | Mock authenticated viewer is real user in `user-service` (seed demo account + runtime-registered users upserted). Own profile = `viewerId !== null && viewerId === user.id` |
| D3 | Saved tab source | `post-service.fetchSavedPosts(actorId, page)` = posts with `isBookmarkedByCurrentUser`. Separate from `fetchUserPosts(userId, tab)` because Saved belongs to viewer, not viewed profile. `/saved` collections untouched (F0.2) |
| D4 | Tab list ownership | Profile-local controller (D19). `post-store` owns ONLY canonical posts; NO profile state added |
| D5 | Follow relations | `src/mocks/follow-graph.ts` is sole source of follow relations. Seed users + exactly 1 level of generated fans |
| D6 | Counts | Visible follower/following count = deterministic hidden baseline (`HIDDEN_*`, seed constant) + graph-derived relation count. NO mutable stored count fields in mock DB. Client `user-store` keeps only an optimistic ±1 projection, reconciled by refetch after mutation. Displayed count intentionally exceeds materialized list (dialog shows partial mock dataset) - NOT bug |
| D7 | Not-found | `page.tsx` resolves username on server: seed user OR current mock session identity -> render, else `notFound()` -> `app/[@username]/not-found.tsx` (404). `ProfileContainer` owns NO route-level not-found. **Limitation:** runtime-registered users are server-resolvable ONLY for current mock session; another session's runtime user (e.g. A opens `/@B`) is 404. Cross-session discovery is out of scope until shared persistent mock store exists - do NOT add server-side fake DB |
| D8 | Mock session cookie | Mock auth mirrors ONLY `MockSessionIdentity = { id, username }` into cookie `ysocial_mock_user` (no mutable profile data -> profile edits never leave it stale). `page.tsx` & `generateMetadata()` read it via `await cookies()`. With Cache Components disabled (current `next.config.ts`), this intentionally makes `/@username` request-time rendered; accepted because runtime-user resolution + real 404 need request-time SSR. **Cookie is NOT an authentication/security boundary**: it is client-writable & only bridges client mock persistence to server route resolution. NEVER reuse this pattern as real auth |
| D9 | Identity split | `useViewerId(): string \| null` = authenticated identity (guest -> `null`). Legacy mock mutation actor: `useActorId(): string` (`viewerId ?? GUEST_ACTOR_ID`, `GUEST_ACTOR_ID = "me"`). `actorId` is legacy mutation identity ONLY & MUST NOT be used for: own-profile checks, Saved visibility, Edit permissions, auth state, route/session resolution. In touched flows (all of `user-service`, `user-store`, new `post-service` fns) service params are named `actorId`; remaining legacy `viewerId` params elsewhere = debt (§11) |
| D10 | Mock login semantics | Mock login ALWAYS signs in seed demo account (`id "1"`, `@ysocial_member`); typed identity only validated by form, no longer becomes username. Register still creates runtime user (`id "2"`, chosen username) |
| D11 | Auth hydration | `auth-store` initial state fixed (`user: null`, `hydrated: false`); `hydrate()` reads localStorage in `Providers` `useLayoutEffect`. Identity-dependent profile UI waits for `hydrated` (skeleton, never transient not-found) |
| D12 | Author consistency | `PostCard` renders author from `useUser(post.user.id) ?? post.user` -> profile edits show everywhere. Snapshot `post.user` stays as fallback; `PostItem` -> `authorId` = debt (§11) |
| D13 | Pin scope | 2A ONLY renders pinned post first in Threads. Pin/unpin mutations stay in 1.5 (`PostCard` owner menu) |
| D14 | Reposts tab | Moved to 6.1 (repost concept does not exist yet) |
| D15 | QR library | `qrcode.react@^4.2.0` - intentional dependency exception (§3). PNG export uses `imageSettings.crossOrigin = "anonymous"`; if canvas export throws (non-CORS avatar -> tainted canvas), retry without embedded avatar instead of failing download |
| D16 | Media grid images | Plain `<img loading="lazy" decoding="async">` like existing post images (no `next/image` remote config; local posts use `blob:` URLs). Every `<img>` has meaningful `alt`; `@next/next/no-img-element` handled with targeted `eslint-disable-next-line` + reason -> 0 new lint warnings |
| D17 | Cross-feature boundary | Existing `profile <-> posts` import cycle (posts -> profile: `post-card`, `post-feed`, `use-new-posts-stream`, `use-pending-feed`; profile -> posts: `PostCard`, `PostSkeletonList`) is accepted as tracked debt (§11). 2A adds NO new feature-to-feature edges. New profile -> posts interactions use callback/event boundaries, NOT new post UI imports: own-Threads CTA emits `onCreatePost`; `ProfileContainer` maps it to global `ui-store.openComposer()`; `MainLayout` owns `PostCreatorDialog`. Allowed on existing edges: non-UI service/store APIs |
| D18 | Reply parent reference | Replies tab gets parents as `ParentReference = { id; author?: PostAuthor; deleted: boolean }`, returned even when parent is tombstoned (deletion marker, never renderable `PostItem`) |
| D19 | Tab state model | `ProfileContainer` calls `useProfileTabPostsController()` & provides it via `<ProfileTabPostsProvider>`; `ProfileTabPanel` reads `useProfileTabPosts(tab)`. Panels may unmount on tab switch; lists survive in controller while profile is mounted |
| D20 | i18n client/server | Client components: `useTranslation()`. Server code (`generateMetadata`, `page.tsx`): pure `translate(DEFAULT_LOCALE, key, params)` extracted to `src/lib/i18n/translate.ts` (hook becomes thin wrapper; behavior unchanged). Server cannot know client locale (lives in `ui-store`) -> metadata always uses `DEFAULT_LOCALE` (`vi`) |

## 3. Global Constraints

- Next.js 16 App Router (Cache Components disabled), React 19, TypeScript strict, Tailwind v4, Zustand 5, shadcn/Radix (`radix-ui` umbrella), Lucide
- **Dependency exception:** `qrcode.react@^4.2.0` (ISC, 0 runtime deps, React `^19` peer, built-in types, `QRCodeSVG` + `QRCodeCanvas`, `imageSettings.excavate` / `crossOrigin`). Chosen over `react-qr-code` (2 deps, no logo), `qr-code-styling` (no React binding, heavier), `qrcode` (Node-oriented deps). Approved
- Files/dirs `kebab-case`; components `PascalCase`; vars/functions `camelCase`; CRLF line endings
- Domain types in `features/<feature>/types/index.ts`; cross-feature imports ONLY via `@/features/<feature>` or `@/features/<feature>/types`; D17 boundary
- Strings via D20, keys in `vi.json` & `en.json`, NO `as any` / `any` in new or touched profile files
- Touch targets >= 44px; icon-only buttons have `aria-label`; transitions 150-300ms, `motion-reduce` respected
- Store updates touching >1 entity happen in 1 `set()`

## 4. Architecture & Data Flow

```
Server  app/[@username]/page.tsx  (request boundary)
        ├── raw = (await cookies()).get(MOCK_SESSION_COOKIE)?.value
        ├── session = parseMockSession(raw)                          [auth/utils, pure]
        ├── resolution = resolveProfileRoute(username, session)      [profile/utils, pure]
        ├── resolution null -> notFound()
        ├── generateMetadata: same 3 steps + translate(DEFAULT_LOCALE, ...)
        └── <ProfileContainer key={username} username={username} />

Client  Providers
        ├── useLayoutEffect: authActions.hydrate()  (localStorage -> store, cookie sync)
        └── <ViewerSync />: after hydrated, on auth user change -> ensureViewerUser(session, actorId)

        ProfileContainer
        ├── useAuthHydrated() false -> ProfileSkeleton
        ├── useUserByUsername(username) + ensureUserByUsername(username, actorId)   [user-store]
        ├── isOwn = viewerId !== null && viewerId === user.id                      [NEVER actorId]
        ├── ProfileHeader -> FollowButton (commitFollow) | EditProfileDialog -> updateProfile -> patchUser
        │                 -> share menu -> copy link | ShareProfileDialog (QR)
        ├── ProfileTabs (threads | replies | media | saved[isOwn])
        └── <ProfileTabPostsProvider value={useProfileTabPostsController(user.id, actorId)}>
              ProfileTabPanel(tab) -> useProfileTabPosts(tab)
                ├── fetchUserPosts / fetchSavedPosts            [post-service]
                ├── upsertPosts -> PostCard(id) / ProfileMediaGrid   [post-store]
                └── own Threads empty CTA -> onCreatePost -> ui-store.openComposer()  [MainLayout renders dialog]
        FollowersDialog -> fetchFollowList(userId, kind, {query, page}, actorId) -> upsertUsers -> FollowButton
```

### 4.1 Auth (`features/auth`)

- **`auth-store` (D11):**
  - Initial: `{ accessToken: null, refreshToken: null, user: null, isAuthenticated: false, hydrated: false }`. Initializer NEVER touches `window`/`localStorage`
  - `actions.hydrate()`: reads tokens + `ysocial_user` (malformed JSON -> signed out & key removed), sets state + `hydrated: true` in 1 `set()`, then syncs cookie (user -> write identity, none -> clear). Idempotent
  - `updateUser` / `clearAuth`: keep localStorage writes, plus cookie write/clear (identity only, D8)
  - Selectors: `useAuthHydrated()`, `useViewerId(): string | null`, `useActorId(): string` (D9). `GUEST_VIEWER_ID` renamed `GUEST_ACTOR_ID`; existing `useViewerId()` call sites (22 refs / 10 files) renamed mechanically to `useActorId()` -> behavior unchanged
- **`features/auth/utils/mock-session.ts`** (pure, no `"use client"`, server-importable):
  - `MOCK_SESSION_COOKIE = "ysocial_mock_user"`; `MockSessionIdentity = { id: string; username: string }`
  - `serializeMockSession(identity)` / `parseMockSession(raw: string | undefined): MockSessionIdentity | null` -> null for empty, malformed JSON, invalid encoding, missing fields, wrong types, invalid username shape (`^[a-z0-9._]{1,30}$` after lowercase). Never throws. Cannot detect tampering (D8)
  - Client-only helpers `writeMockSessionCookie(identity)` / `clearMockSessionCookie()`: `path=/; SameSite=Lax; max-age=2592000`
- **Mock login (D10):** `login-form` calls `updateUser({ ...SEED_DEMO_ACCOUNT, email: "member@ysocial.dev", bio })` (`SEED_DEMO_ACCOUNT` from `src/mocks/`) Register unchanged except cookie sync through `updateUser`
- **`Providers`:** `hydrate()` runs first in existing `useLayoutEffect` (before locale/search rehydrate). `<ViewerSync />` (in `features/profile`, rendered by `app/providers.tsx` = app layer, not feature edge) calls `ensureViewerUser` once per session id, only after `hydrated`

### 4.2 Shared mocks (`src/mocks/`)

- **`seed-authors.ts`:** add `SEED_DEMO_ACCOUNT: PostAuthor = { id: "1", displayName: "YSocial Member", username: "ysocial_member", isVerified: true, avatarUrl }`. NOT appended to `SEED_AUTHORS` (stream/random author pools & index-based mock posts unchanged)
- **`seed-fans.ts` (new):** `SEED_FANS: PostAuthor[]` + `SEED_FAN_FOLLOWS: Record<baseId, fanId[]>`. Deterministic PRNG (`mulberry32(0x5eed)`): each base user (8 `SEED_AUTHORS` + demo) gets 30-60 fans; id `fan-<base 2 digits>-<n 3 digits>`; VN name pools; ~half reuse existing Unsplash avatar pool, rest initials fallback. Fans: no bio, never verified
- **`follow-graph.ts`** (D5) - rewritten, existing exports kept:
  - State: `following: Map<id, Set<id>>` + reverse index `followers: Map<id, Set<id>>`, mutated through 1 helper -> O(1) counts
  - Seed: base users follow each other per `SEED_FOLLOWING` (new small hand-written map incl. demo); fans follow ONLY their base user (fans have 0 followers & follow nobody else); legacy actor `"me"` & demo follow `SEED_FOLLOWED_AUTHOR_IDS`
  - Unknown id (runtime user) materialized on first access with `SEED_FOLLOWED_AUTHOR_IDS`; `upsertViewerUser` touches it immediately so counts never jump later
  - API: `getFollowedAuthorIds(id)`, `getFollowerIds(id)`, `getFollowingCount(id)`, `getFollowerCount(id)`, `setFollowed(followerId, targetId, following)` (self ignored, idempotent), `__resetFollowGraph()` (both maps back to seed)

### 4.3 `user-service` (mock, `features/profile/services`)

- `db` seeded from `MOCK_USERS` (8 authors + demo + fans). Stored `UserProfileBase` has NO counts; `project(user, actorId)` adds `followersCount = HIDDEN_FOLLOWERS[id] + getFollowerCount(id)`, `followingCount = HIDDEN_FOLLOWING[id] + getFollowingCount(id)`, `isFollowing`. `HIDDEN_*` in `profile/mocks` (= current EXTRAS counts; 0 for demo, fans, runtime users)
- ALL params renamed `viewerId` -> `actorId` (D9); callers updated
- `getSeedUserByUsername(username)` lives in `profile/mocks/mock-users.ts` (sync, pure, server-safe, case-insensitive), used by `resolveProfileRoute`. Reads ONLY frozen `MOCK_USERS` seed, NEVER mutable `db` or runtime users (D7)

| Function | Behavior |
|---|---|
| `fetchUserByUsername(username, actorId)` | `UserProfile \| null`; case-insensitive |
| `fetchFollowList(userId, kind, { query, page }, actorId)` | `{ users: UserProfile[]; nextPage?: number }`, 20/page; only ids present in `db` (legacy actor `"me"` counted in graph, never listed); order: seed/runtime users first (followers desc), then fans by id; `query` via `normalizeText` over displayName + username |
| `updateProfile(id, patch, actorId)` | `patch: { displayName; bio?; avatarUrl? }`; `actorId !== id` -> `ForbiddenError`; same Zod limits as dialog; returns projected copy. Username not editable (cookie identity stays valid) |
| `upsertViewerUser(identity & profile fields, actorId)` | Upserts runtime user (no-op for seed ids), materializes graph node, returns projected `UserProfile` |
| `setFollow(id, following, actorId)` | ONLY `setFollowed(...)` (count mutation removed, D6) |

- `ForbiddenError` moves from `post-service` to `src/lib/errors.ts` (posts re-exports it, API unchanged) -> `user-service` adds no new feature edge
- `fetchSuggestedUsers` excludes fans; `searchUsers` includes them

### 4.4 `post-service` additions (`features/posts/services`)

| Function | Behavior |
|---|---|
| `fetchUserPosts(userId, tab, page)` | `tab: "threads" \| "replies" \| "media"`, 10/page, newest first. `threads` = roots by author; page 1 puts author's pinned root first (excluded from later pages). `replies` = posts with `parentId` by author. `media` = roots with `imageUrl` or non-empty `imageUrls`. Returns `{ posts: PostItem[]; parents: ParentReference[]; nextPage?: number }` (`parents` only for `replies`) |
| `fetchSavedPosts(actorId, page)` | Bookmarked posts (roots & replies), newest first, 10/page. `actorId` reserved for per-viewer bookmarks (flag currently global, §11) |

- `ParentReference` (D18) in `posts/types`: parent tombstoned/removed -> `{ id, deleted: true }` (no author, no content); available -> `{ id, author, deleted: false }`. Tombstoned ids are never returned as `PostItem`
- Mock data: add demo-account content to `mock-posts.ts` (4 roots incl. 1 multi-image & 1 pinned, 2 replies to seed posts)
- New `post-store` selector `usePinnedPostId(authorId)` exported via posts barrel (non-UI, existing edge)

### 4.5 `user-store` changes (`features/profile/store`)

- Data: `idByUsername: Record<lowercaseUsername, id>` maintained by `upsertUsers`
- Actions:
  - `toggleFollow(actorId, id)`: flips projection, target `followersCount ±1`, actor `followingCount ±1` when actor cached, `version + 1` (1 `set()`) - optimistic projection only
  - `patchUser(id, patch)`: merges shared base fields
- Module fns (params `actorId`):
  - `commitFollow(actorId, id)`: `toggleFollow` -> `setFollow` -> success: `refreshUsers([id, actorId], actorId)` ONLY if actor's `version` is unchanged since (newer toggle wins); failure: revert via `toggleFollow` + toast. `FollowButton` & `FollowersDialog` call this
  - `ensureUserByUsername(username, actorId)`: cache hit via `idByUsername` + known follow state, else `fetchUserByUsername`; in-flight dedupe per `actorId:username`
  - `refreshUsers(ids, actorId)`: refetch & upsert (bypasses cache); unknown ids ignored
  - `ensureViewerUser(viewerInput, actorId)`: `upsertViewerUser` -> `upsertUsers`; 1 shared promise per user id (failed promise evicted). `ProfileContainer` awaits this same promise when `username` is signed-in user's, instead of `ensureUserByUsername` -> no race with `ViewerSync` on hard refresh, no false desync
- Selector: `useUserByUsername(username): UserProfile | undefined`

### 4.6 Profile tab controller (`features/profile/hooks`) - D19

- **`use-profile-tab-posts.ts`:**
  - `useProfileTabPostsController(userId, actorId)` -> controller: `useReducer` state `Record<ProfileTab, { ids; parents; status: "idle" | "loading" | "ready" | "error"; nextPage? }>` + `activate(tab)`, `loadMore(tab)`, `retry(tab)`. `scopeKey = userId:actorId`; a change resets all tabs & invalidates in-flight requests (Saved is actor-owned; like/bookmark flags actor-scoped) - covers login/logout while staying on same profile
  - `ProfileTabPostsProvider` (context) + `useProfileTabPosts(tab)` -> `{ ids, parents, status, hasMore, loadMore, retry }`; calls `activate(tab)` on mount -> fetch on first activation only
  - Fetch results: `upsertPosts(posts)`; `parents` kept in controller state (references, not posts). Stale responses ignored via per-tab request token; `key={username}` on container resets everything
  - Deleted ids filtered at render through `useIsDeleted` (tombstone)
- **`order-with-pin.ts`** (pure): `orderWithPin(ids, pinnedId)` -> pinned first when present; memoized with `usePinnedPostId(user.id)` -> live reorder after pin/unpin, O(n) only on change

## 5. Routes (`app/[@username]/`)

- **`page.tsx`** (Server Component, thin; ONLY Next request boundary): `await params`, `await cookies()`, `parseMockSession`, `resolveProfileRoute(username, session)` (`features/profile/utils/resolve-profile-route.ts`, pure: decode, strip leading `@`, lowercase compare) -> `{ kind: "seed"; user } | { kind: "session"; identity } | null`; `null` -> `notFound()`. Renders `<MainLayout><ProfileContainer key={username} username={username} /></MainLayout>`. NO `fetch`, NO `BASE_URL`, NO dev fallback branch
- **`generateMetadata`:** same resolution. Seed -> title `Name (@username) • YSocial`, description = bio or default, OG `type: "profile"`, image = avatar. Session (runtime) user -> title `@username • YSocial`, default description, no image (server has no profile data, D8). Not found -> not-found title. Strings via `translate(DEFAULT_LOCALE, ...)` (D20)
- **`loading.tsx`:** NOT shipped (it streams shell first, so `notFound()` would answer HTTP 200). `<ProfileSkeleton />` serves client hydration gate only
- **`not-found.tsx`:** `EmptyState` (`UserX`) "Người dùng không tồn tại" + CTA Home
- **`error.tsx`:** `EmptyState` + Retry (`reset()`)
- **Desync edge:** server resolved session user but client cannot (cookie present, localStorage wiped) -> `hydrate()` clears cookie; container shows an inline `EmptyState` + `router.refresh()` CTA, which then lands on route 404. This inline state is client UI for this desync ONLY, NOT route-level not-found

## 6. UI / Components (`features/profile/components/`)

| Component | Change |
|---|---|
| `profile-container.tsx` | Rewritten: hydrated gate -> skeleton; user via store; `isOwn` via `useViewerId()`; owns tab controller provider, `FollowersDialog` & `ShareProfileDialog` state; maps `onCreatePost` -> `useUIActions().openComposer()`. Removes `useQuery`, `apiClient`, inline mocks, `any` |
| `profile-skeleton.tsx` (new) | Shared by `loading.tsx` & hydration gate |
| `profile-header.tsx` | `FollowButton` (`commitFollow`); counts = buttons opening dialog tab; Share button (`Share2`, `aria-label`) -> dropdown "Sao chép liên kết" / "Mã QR"; i18n |
| `edit-profile-dialog.tsx` | Submit -> `updateProfile(id, patch, actorId)` -> `patchUser`; error toast; removes `apiClient`. Cookie untouched (identity only) |
| `profile-tabs.tsx` | `role="tablist"`, `aria-selected`, arrow-key navigation; `threads / replies / media / saved(isOwn)`; i18n |
| `profile-tab-panel.tsx` (new) | `role="tabpanel"`; Threads/Replies/Saved -> `PostCard` list + infinite-scroll sentinel (`PostFeed` pattern); Media -> `ProfileMediaGrid`; per-tab `EmptyState` (own vs other copy); own Threads CTA emits `onCreatePost` (NO `PostCreatorDialog` import); error + Retry inside panel |
| `reply-context.tsx` (new) | Above each reply: `ParentReference.deleted` -> "Bài viết gốc đã bị xóa"; else "Trả lời @author" link to `/posts/[parentId]` |
| `profile-media-grid.tsx` (new) | 3-col grid, `aspect-square`, `gap-0.5`, `<img>` per D16 with `alt` = i18n "Ảnh trong bài viết của @username" (+ index when multi); first image; multi-image -> `Layers` badge; tile = link `/posts/[id]` |
| `followers-dialog.tsx` | Mock lists removed; 2 tabs via `fetchFollowList`; search (debounce 250ms, resets paging); infinite scroll in `ScrollArea`; rows = avatar + name link (closes dialog) + `FollowButton` (hidden for self); unfollow confirm kept; empty/no-match `EmptyState` |
| `share-profile-dialog.tsx` (new) | `QRCodeSVG` (profile URL, level `M`, center avatar `excavate`, Zinc-900 on white card even in dark mode); "Sao chép liên kết" (icon -> check 1.5s); "Tải PNG": hidden `QRCodeCanvas` with `imageSettings.crossOrigin = "anonymous"` -> `toDataURL()`; on `SecurityError` re-render canvas without `imageSettings` & export again (D15); `<a download="ysocial-<username>-qr.png">` |
| `viewer-sync.tsx` (new) | See §4.1 |

- `posts/components/post-card.tsx`: author header reads `useUser(post.user.id) ?? post.user` (D12; existing posts -> profile edge, non-UI hook)
- `lib/store/ui-store.ts`: `composerOpen` + `openComposer()` / `setComposerOpen(open)`; `components/layout/main-layout.tsx` binds its existing `PostCreatorDialog` to it (replaces local `isCreateOpen`)
- `main-layout.tsx`: profile nav href = viewer username; guest -> `/login`.
- Share URL = `${window.location.origin}/@${username}` (computed on click, client only)

## 7. i18n

- **Domains:** `profile.*` (exists - extended: header, tabs, empty/error states, edit dialog, follow list, not-found, media alt, metadata), `share.*` (new: menu, QR dialog, copy/download toasts). Full key list in plan. Remove every hardcoded VN/EN string in touched profile files
- `src/lib/i18n/translate.ts`: pure `translate(locale, key, params)` + `TranslationKey` type moved there; `useTranslation` wraps it (D20)

## 8. Edge Cases

| Case | Behavior |
|---|---|
| `/@Anquoc.Dev`, `/%40anquoc.dev` | Decoded, `@` stripped, case-insensitive match |
| Unknown username | Server `notFound()` -> 404 + `not-found.tsx` |
| Runtime user opens own profile | Cookie identity match -> rendered; client waits `hydrated` + `ViewerSync` -> data |
| Runtime user A opens `/@B` (B registered in another session) | 404 (D7 limitation) |
| Logout then open own runtime username | Cookie cleared -> 404 |
| Guest opens any profile | Viewable; no Saved, no Edit (`viewerId` null); Follow uses legacy actor `"me"` (gating = §11) |
| Navigate A -> B | `key={username}` resets tab controller & dialogs |
| Follow in dialog / header / card | `commitFollow` -> header counts, hover card, search, suggestions update; refetch reconciles from graph |
| Rapid follow/unfollow | Only latest toggle's refetch applies (version check) |
| Follow fails | Projection reverted + toast |
| Followers count 12_843 vs list of 43 | Expected: hidden baseline (D6) |
| Edit own profile | `patchUser` -> header, hover cards, `PostCard` authors update; cookie unaffected (identity only) |
| Pin/unpin from card menu while on profile | Threads reorders via `orderWithPin`; an older post fetched only because it was pinned stays at top until next open |
| Unbookmark inside Saved | Item stays (icon flips), removed on next open (no layout jump) |
| Delete own post in tab | Tombstone -> hidden in every tab & feed |
| Reply whose parent was deleted | `ParentReference.deleted` -> "Bài viết gốc đã bị xóa" |
| QR PNG with non-CORS avatar | Canvas export retried without avatar; download still succeeds |
| Clipboard denied | Toast error + link input auto-selected |
| Tab fetch fails | Panel error + Retry; other tabs & header unaffected |
| Malformed `ysocial_user` JSON / cookie | Signed out; key & cookie cleared / `parseMockSession` -> null -> treated as no session |
| Cookie/localStorage desync | §5 desync edge |

## 9. Testing (TDD, Vitest + RTL)

| File | Cases |
|---|---|
| `auth/store/auth-store.test.ts` (new) | Initial state signed-out & `hydrated: false` even with localStorage populated (SSR-safe); `hydrate()` loads user/tokens & sets `hydrated` in 1 update; malformed JSON -> signed out + key removed; idempotent; `updateUser` writes cookie with ONLY `{ id, username }`; `clearAuth` clears cookie; `useViewerId` null for guest; `useActorId` `"me"` for guest |
| `auth/utils/mock-session.test.ts` (new) | Round-trip; empty / malformed JSON / bad encoding / missing fields / wrong types / invalid username shape -> null; extra fields dropped |
| `auth/components/login-form.test.tsx` (new) | Login always yields `SEED_DEMO_ACCOUNT` id & username |
| `app/providers.test.tsx` (new) | `hydrate()` before children read identity; `ViewerSync` calls `ensureViewerUser` once per session id, never before `hydrated` |
| `lib/i18n/translate.test.ts` (new) | Key lookup, params, missing key fallback; hook output unchanged |
| `mocks/follow-graph.test.ts` (rewrite) | Fans follow only their base & have 0 followers; reverse index matches forward after set/unset; O(1) counts correct; self ignored; idempotent; unknown id materialized; `__resetFollowGraph` restores seed (`beforeEach` isolation) |
| `mocks/seed-fans.test.ts` (new) | Deterministic ids; 30-60 per base; unique ids; 1 level only |
| `profile/services/user-service.test.ts` (extend) | Counts = hidden baseline + graph (follow -> target followers +1 & actor following +1, no stored count); `fetchUserByUsername` case-insensitive hit/miss; `fetchFollowList` paging 20, query, order, legacy `"me"` not listed; `updateProfile` owner / `ForbiddenError` / validation; `upsertViewerUser` upsert + seed no-op; suggestions exclude fans. `beforeEach`: `__resetMockUsers()` + `__resetFollowGraph()` |
| `profile/store/user-store.test.ts` (extend) | `idByUsername`; `patchUser`; `toggleFollow` target & actor counts; `commitFollow` success refetch / stale refetch skipped / failure revert; `ensureUserByUsername` cache & dedupe |
| `profile/utils/resolve-profile-route.test.ts` (new) | Seed hit; `@` / encoded / case variants; session match -> `session`; valid session + different username -> null; null session + unknown -> null |
| `app/[@username]/page.test.tsx` (new) | Runtime user A + A cookie -> renders; runtime user B with A cookie -> `notFound()`; malformed cookie + unknown -> `notFound()`; metadata for runtime user has no image |
| `profile/hooks/order-with-pin.test.ts` (new) | Pinned first; absent pinned -> unchanged; no pin -> unchanged |
| `profile/hooks/use-profile-tab-posts.test.tsx` (new) | First activation fetches once; panel unmount/remount keeps list; loadMore appends; error -> retry; stale response ignored; `parents` stored |
| `posts/services/post-service.test.ts` (extend) | `fetchUserPosts` per tab; threads page 1 pinned first & excluded later; replies `parents`; deleted parent -> `{ id, deleted: true }` marker, never `PostItem`; media only with images; `fetchSavedPosts` bookmarked only; tombstones excluded |
| `profile/components/profile-container.test.tsx` (new) | Skeleton until hydrated (no not-found flash); Saved & Edit only when `viewerId === user.id` (guest with actor `"me"` never own); Threads pinned first & reorders after `setPinned`; own empty Threads CTA calls `openComposer`; tab error isolated |
| `profile/components/followers-dialog.test.tsx` (new) | Lists from service; search filters; follow -> header follower count updates; self row has no Follow |
| `profile/components/share-profile-dialog.test.tsx` (new) | QR `svg` rendered; copy calls `clipboard.writeText` with `/@username` URL; clipboard reject -> toast + input selected; PNG export with avatar (`crossOrigin = "anonymous"`) -> download; `toDataURL` throws `SecurityError` -> fallback without avatar still downloads |
| `profile/components/profile-media-grid.test.tsx` (new) | Only image posts; link `/posts/[id]`; multi-image badge; every `img` has non-empty `alt` |
| `posts/components/post-card.test.tsx` (extend) | Author name/avatar follow `user-store` after `patchUser`; snapshot fallback when uncached |

- Tests rendering async containers MUST await first fetch before ending (post-detail pitfall)

## 10. Verification

- `npm run test`, `npm run typecheck`, `npm run lint` -> report exact counts, 0 new errors/warnings
- Greps (expected 0 results unless noted):
  - `apiClient` in `src/features/profile`
  - `PostCreatorDialog` in `src/features/profile`
  - `useViewerId` in `src/features/posts` (posts uses `useActorId` only)
  - `useViewerId` in `src/features/profile` -> ONLY identity checks (container own-profile, `ViewerSync`, nav); review each hit
  - `viewerId` params in `user-service` / `user-store`
- Browser pane (real cookie/localStorage consistency):
  1. Register runtime user -> 2. open own profile -> 3. hard refresh (still renders, no hydration warning) -> 4. open unknown username (404 status in network) -> 5. logout -> 6. open same runtime username -> 7. MUST be real 404.
  - Plus: login -> `/@ysocial_member`; `/@anquoc.dev`; 4 tabs; follow sync to feed/hover card; dialog search + paging; QR copy + PNG download with Unsplash avatar; pin reorder; 375 / 768 / 1440, light & dark, keyboard focus; `ui-ux-pro-max` Pre-Delivery Checklist
- Close-out: `.context/features/profile.md` (new as-built), `INDEX.md`, roadmap (F0.6, 2.1, 2.2, 2.6 `[x]`; F0.4 & 7.7 `/@username` done; gap #2 profile part done)

## 11. Tech Debt (recorded, not in 2A)

- Existing `profile <-> posts` import cycle (D17); candidate fix: neutral `features/users` (user-service, user-store, `FollowButton`, `UserHoverCard`) so Posts -> Users & Profile -> Users
- `PostItem.user` snapshot -> `authorId` + `user-store` as only author source (D12 overlay is interim)
- Guest gating: block follow/like/post for `viewerId = null` (redirect `/login`), retire `GUEST_ACTOR_ID`
- Rename remaining legacy `viewerId` service params to `actorId` outside touched flows (`post-service.fetchFeed`, search callers)
- Per-viewer bookmark/like flags in `post-service` (currently global on post)
- Mock auth persisted twice (localStorage + identity cookie) - revisit with 2C; cross-session runtime users need shared persistent mock store (D7)

## 12. Out of Scope

- Followers/following routes (D1), Reposts tab (6.1), private account / follow requests / close friends / block-mute (2B), profile switcher (2C), `/saved` collections on mocks (F0.2), cover image upload, avatar file upload (URL field only, as today), server-side fake DB
