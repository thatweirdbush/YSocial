# Profile Core (2A) Implementation Plan

> **Agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`; execute task-by-task. Track steps via `- [x]`

- **Goal:** `/@username` runs fully on mocks (F0.6) with Threads / Replies / Media / Saved tabs (2.1), store-bound followers/following dialog with search (2.2) & share link + QR (2.6), on top of SSR-safe auth hydration & explicit viewer/actor identity split
- **Architecture:** mock services (`user-service`, `post-service`, `src/mocks/follow-graph`) stay the ONLY data sources; follow graph is sole relation source & counts derive from it. `page.tsx` is only Next request boundary (`await cookies()` -> pure `parseMockSession` -> pure `resolveProfileRoute` -> `notFound()`). Client profile reads `user-store` / `post-store`; tab id lists live in profile-local controller (context), never in `post-store`
- **Tech stack:** Next.js 16 App Router (Cache Components disabled), React 19, TypeScript strict, Zustand 5, Tailwind v4, shadcn/Radix (`radix-ui`), Lucide, `qrcode.react@^4.2.0` (Task 14), Vitest 4 + RTL + jsdom
- **Spec:** `docs/specs/2026-10-07-profile-core-design.md` (refs `D#` / `§#`). Executors read both
- All paths relative to `ysocial-clients/web-app/`. Branch: `feature/profile-core`

## Global Constraints

- NO BE/API calls in new/touched flows; after Task 11 `src/features/profile` has 0 `apiClient` imports. NO server-side fake DB (D7)
- New dependency: `qrcode.react@^4.2.0` - approved (spec §3 exception); installed in Task 14 without further gate
- Files `kebab-case`, components `PascalCase`, CRLF line endings, `import type` for type-only imports, sorted imports, file-scoped regions where files are large.
- Domain types ONLY in `features/<feature>/types/index.ts`; cross-feature imports ONLY via `@/features/<feature>` or `@/features/<feature>/types`
- **D17:** NO new feature-to-feature import edges. Existing edges: posts -> profile, profile -> posts, profile -> auth, posts -> auth, search -> profile/posts/auth. On existing edges ONLY non-UI APIs (services, store hooks/selectors, types) may be added; only post UI profile may use is already-imported `PostCard` & `PostSkeletonList`. `features/profile` MUST NOT import `PostCreatorDialog`; `auth` MUST NOT import `profile`
- **D9:** `actorId` (legacy `"me"` fallback) is ONLY for mock mutations/fetch scoping; NEVER for own-profile, Saved visibility, Edit permission, auth state or route resolution - those use `useViewerId(): string | null`
- Strings: client `useTranslation()`, server `translate(DEFAULT_LOCALE, ...)`; keys in both `vi.json` & `en.json`
- Touch targets >= 44px; icon-only buttons have `aria-label`; transitions 150-300ms + `motion-reduce:*`; every `<img>` has non-empty `alt`
- Store updates touching >1 entity happen in 1 `set()`
- Baseline (2026-10-07, `main` @ `6452425`): `npm run test` 342 passed / 38 files; `npm run typecheck` exit 0; `npx eslint src` 62 errors, 25 warnings, per file/rule in Appendix A -> **NO file/rule count may increase** (lower total that hides new error elsewhere fails); touched profile files' existing errors MUST disappear
- Tests: services use fake timers + `settle()` (`vi.runAllTimersAsync()` then await); reset `__resetMockUsers()`, `__resetFollowGraph()`, `__resetMockDb()`, `resetUserStore()`, `resetPostStore()` in `beforeEach`; async containers MUST await first fetch before test ends
- Commit messages: Conventional Commits, author = user ONLY, **NO `Co-Authored-By` trailer**

## Review Focus

1. **Hard refresh on own runtime profile** (register -> `/@newuser` -> F5) -> server renders (cookie), client shows skeleton until `hydrated`, then data; never a not-found flash, false desync or hydration warning. Pinned: Task 3 ("initial state ignores localStorage"), Task 11 ("skeleton until hydrated", "register -> F5 no desync")
2. **Logout then reopen own runtime username** -> real 404 (cookie cleared by `clearAuth`). Pinned: Task 3 ("clearAuth clears cookie"), Task 12 ("no session + runtime username -> notFound")
3. **Rapid double Follow click in dialog & header** -> final state matches last click; counts reconcile to graph, no drift. Pinned: Task 6 ("stale refetch skipped after newer toggle")
4. **Switching tabs quickly while fetch is in flight** -> late response of old tab never lands in new tab; each tab fetched once. Pinned: Task 9 ("stale response ignored", "remount does not refetch")
5. **QR PNG with avatar host that is not CORS-readable** -> download still succeeds without avatar. Pinned: Task 14 ("SecurityError fallback")
6. **Login/logout while staying on profile** (actor changes, `username` key does not) -> Saved never shows previous actor's list. Pinned: Task 9 ("actor A -> actor B")

---

### Task 1: Server-safe utilities (`translate`, `ForbiddenError`)

**Files:**
- Create: `src/lib/i18n/translate.ts`, `src/lib/i18n/translate.test.ts`, `src/lib/errors.ts`
- Modify: `src/hooks/use-translation.ts`, `src/features/posts/services/post-service.ts` (re-export `ForbiddenError` from `@/lib/errors`)

**Interfaces:**
- Produces: `type TranslationKey` (moved to `src/lib/i18n/translate.ts`, same union; `share.*` added in Task 11), `translate(locale: LocaleType, key: TranslationKey, params?: Record<string, string | number>): string`; `useTranslation()` unchanged API (`{ t, locale }`), `t = (key, params) => translate(locale, key, params)`; `class ForbiddenError extends Error` (name `"ForbiddenError"`, default message `"Forbidden"`) in `@/lib/errors`, still exported from `@/features/posts`

- [x] **Step 1: Failing test** `translate.test.ts`: `translate("vi","hoverCard.retry") === "Thử lại"`; `translate("en","card.minutesAgo",{ n: 5 }) === "5m ago"`; unknown key returns key; non-string leaf returns key
- [x] **Step 2:** `npm run test -- translate` -> FAIL (module missing)
- [x] **Step 3:** Move lookup + param replace from hook into `translate` (no `any`: walk with `unknown` + `typeof value === "object"` guard). Hook wraps it. Move `ForbiddenError` to `src/lib/errors.ts`; `post-service.ts` does `export { ForbiddenError } from "@/lib/errors"` & imports it for internal use
- [x] **Step 4:** `npm run test` -> 342 + new PASS; `npm run typecheck` exit 0
- [x] **Step 5:** Commit `refactor(i18n): extract server-safe translate & shared ForbiddenError`

---

### Task 2: Mock session identity (pure parse/serialize + cookie helpers)

**Files:**
- Create: `src/features/auth/utils/mock-session.ts`, `src/features/auth/utils/mock-session.test.ts`
- Modify: `src/features/auth/types/index.ts`, `src/features/auth/index.ts`

**Interfaces:**
- Produces (types, `auth/types`): `interface MockSessionIdentity { id: string; username: string }`
- Produces (fns, exported via `@/features/auth`): `MOCK_SESSION_COOKIE = "ysocial_mock_user"`; `MOCK_SESSION_MAX_AGE = 2_592_000`; `USERNAME_PATTERN = /^[a-z0-9._]{1,30}$/`; `serializeMockSession(identity): string` (= `encodeURIComponent(JSON.stringify({ id, username }))`); `parseMockSession(raw: string | undefined): MockSessionIdentity | null`; `toMockSession(user: AuthUser): MockSessionIdentity` (`username = (user.username ?? user.email.split("@")[0]).toLowerCase()`); `writeMockSessionCookie(identity): void`; `clearMockSessionCookie(): void`. File has NO `"use client"`; cookie helpers no-op when `typeof document === "undefined"`

- [x] **Step 1: Failing tests:** round-trip `parseMockSession(serializeMockSession({ id: "2", username: "new.user" }))` equals input; extra fields dropped (`{ id, username, displayName }` -> only `{ id, username }`); returns `null` for `undefined`, `""`, `"%E0%A4%A"` (bad encoding), `"not-json"`, `encodeURIComponent('{"id":"2"}')` (missing username), `{"id":2,"username":"a"}` (wrong type), username `"Bad Name!"` (shape), username of 31 chars; `toMockSession({ id: "1", email: "Mem@x.dev" })` -> `{ id: "1", username: "mem" }`; `writeMockSessionCookie` then `document.cookie` contains `ysocial_mock_user=`; `clearMockSessionCookie` removes it
- [x] **Step 2:** `npm run test -- mock-session` -> FAIL
- [x] **Step 3:** Implement; `parseMockSession` wraps `decodeURIComponent` + `JSON.parse` in try/catch, validates `typeof id === "string" && id.length > 0` & `USERNAME_PATTERN.test(username)`. Cookie string: `${MOCK_SESSION_COOKIE}=${value}; path=/; SameSite=Lax; max-age=${MOCK_SESSION_MAX_AGE}`; clear = `max-age=0`. Doc comment: "Mock bridge only - NOT auth/security boundary (spec D8)"
- [x] **Step 4:** `npm run test -- mock-session` PASS; typecheck exit 0
- [x] **Step 5:** Commit `feat(auth): mock session identity cookie helpers`

---

### Task 3: SSR-safe auth hydration, viewer/actor split, mock login semantics

**Files:**
- Create: `src/features/auth/store/auth-store.test.ts`, `src/features/auth/components/login-form.test.tsx`, `src/app/providers.test.tsx`
- Modify: `src/features/auth/store/auth-store.ts`, `src/app/providers.tsx`, `src/features/auth/components/login-form.tsx`, `src/mocks/seed-authors.ts` (add `SEED_DEMO_ACCOUNT` only), every `useViewerId` / `GUEST_VIEWER_ID` reference (22 refs / 10 files listed by `grep -rn "useViewerId\|GUEST_VIEWER_ID" src`, incl. tests: `new-posts-pill.test.tsx`, `post-feed.test.tsx`, `search-box.test.tsx`, `user-hover-card.test.tsx`, `posts/hooks/use-current-author.ts`)

**Interfaces:**
- Consumes: Task 2 `toMockSession`, `writeMockSessionCookie`, `clearMockSessionCookie`
- Produces: `AuthState.hydrated: boolean`; `actions.hydrate(): void`; `GUEST_ACTOR_ID = "me"`; `useAuthHydrated(): boolean`; `useViewerId(): string | null` (= `state.user?.id ?? null`); `useActorId(): string` (= `state.user?.id ?? GUEST_ACTOR_ID`); `getActorId(): string` (non-hook twin for module fns/tests). `SEED_DEMO_ACCOUNT: PostAuthor = { id: "1", displayName: "YSocial Member", username: "ysocial_member", isVerified: true, avatarUrl: avatar("photo-1527980965255-d3b416303d12") }` in `src/mocks/seed-authors.ts` (NOT in `SEED_AUTHORS`)

- [x] **Step 1: Failing tests** `auth-store.test.ts` (`beforeEach`: `localStorage.clear()`, clear cookie, `vi.resetModules()` + dynamic import so the initializer re-runs): with `ysocial_user` + tokens pre-seeded in localStorage the freshly imported store has `user === null`, `hydrated === false`; `hydrate()` -> user, tokens, `isAuthenticated`, `hydrated` set (single `set()` asserted via `subscribe` call count === 1) & cookie written with ONLY `{ id, username }` (parse `document.cookie` with `parseMockSession`); malformed `ysocial_user` -> signed out, key removed, cookie cleared; second `hydrate()` changes nothing; `updateUser` writes cookie; `clearAuth` clears cookie; `renderHook(useViewerId)` null for guest, `"1"` after `updateUser`; `useActorId` `"me"` for guest
- [x] **Step 2: Failing tests** `login-form.test.tsx`: submit password step with identity `"someone@else.com"` -> `useAuthStore.getState().user` matches `{ id: "1", username: "ysocial_member" }` (fake timers for 1200ms delay). `providers.test.tsx`: child reading `useAuthHydrated()` in render sees `true` on its first committed effect (hydrate runs in Providers' layout effect before children effects)
- [x] **Step 3:** `npm run test -- auth-store login-form providers` -> FAIL
- [x] **Step 4:** Implement. Initializer: fixed signed-out state, `hydrated: false`, NO `window` access. `hydrate`: if already `hydrated` return; read in try/catch; 1 `set()`; then cookie sync. `updateUser`/`clearAuth` add cookie write/clear. `Providers` layout effect: `useAuthStore.getState().actions.hydrate()` FIRST, then locale/search. Login `onSubmit`: `updateUser({ id: SEED_DEMO_ACCOUNT.id, email: "member@ysocial.dev", displayName: SEED_DEMO_ACCOUNT.displayName, username: SEED_DEMO_ACCOUNT.username, avatarUrl: SEED_DEMO_ACCOUNT.avatarUrl, bio: "Joined YSocial Premium Social Ecosystem" })`; comment cites D10. Rename every existing `useViewerId` -> `useActorId` & `GUEST_VIEWER_ID` -> `GUEST_ACTOR_ID` (pure rename; local variables named `viewerId` in those files become `actorId`)
- [x] **Step 5:** `npm run test` -> all PASS; `npm run typecheck` exit 0; `grep -rn "GUEST_VIEWER_ID" src` -> 0
- [x] **Step 6:** Commit `fix(auth): SSR-safe hydration, viewer/actor identity split & demo-account login`

---

### Task 4: Seed fans & bidirectional follow graph

**Files:**
- Create: `src/mocks/seed-fans.ts`, `src/mocks/seed-fans.test.ts`
- Modify: `src/mocks/seed-authors.ts` (add `SEED_FOLLOWING`), `src/mocks/follow-graph.ts`, `src/mocks/follow-graph.test.ts` (rewrite)

**Interfaces:**
- Produces: `SEED_FOLLOWING: Readonly<Record<string, readonly string[]>>` = `{ "author-01": ["author-02","author-03","author-06"], "author-02": ["author-01","author-04"], "author-03": ["author-01","author-02","author-05"], "author-04": ["author-02","author-06"], "author-05": ["author-01","author-03"], "author-06": ["author-01","author-08"], "author-07": ["author-01","author-02","author-03"], "author-08": ["author-04","author-06"], "1": SEED_FOLLOWED_AUTHOR_IDS, "me": SEED_FOLLOWED_AUTHOR_IDS }`
- Produces: `FAN_BASE_IDS: readonly string[]` (8 `SEED_AUTHORS` ids + `"1"`); `SEED_FANS: PostAuthor[]`; `SEED_FAN_FOLLOWS: Readonly<Record<string, readonly string[]>>` (baseId -> fan ids); `isFanId(id: string): boolean` (`id.startsWith("fan-")`).
- Produces (graph): `getFollowedAuthorIds(id): ReadonlySet<string>` (following, copy), `getFollowerIds(id): ReadonlySet<string>` (copy), `getFollowingCount(id): number`, `getFollowerCount(id): number`, `setFollowed(followerId, targetId, following): void`, `__resetFollowGraph(): void`

- [x] **Step 1: Failing tests** `seed-fans.test.ts`: 2 imports via `vi.resetModules()` yield identical `SEED_FANS` ids; each base has 30-60 fans; all fan ids unique & match `/^fan-\d{2}-\d{3}$/`; usernames match `USERNAME_PATTERN` & unique; no fan has `bio`/`isVerified`
- [x] **Step 2: Failing tests** `follow-graph.test.ts` (`beforeEach(__resetFollowGraph)`): every fan of `author-01` is in `getFollowerIds("author-01")`; fan's `getFollowerCount` is 0 & `getFollowedAuthorIds(fan)` equals `{ baseId }`; `getFollowerIds(x)` stays consistent with forward sets after `setFollowed("me","author-01",true)` then `false`; counts equal set sizes; self-follow ignored; double `setFollowed(..., true)` idempotent (count +1 once); unknown `"v1"` materialized with `SEED_FOLLOWED_AUTHOR_IDS` on first `getFollowedAuthorIds`/`getFollowingCount`; returned sets are copies; `__resetFollowGraph()` restores seed counts
- [x] **Step 3:** `npm run test -- seed-fans follow-graph` -> FAIL
- [x] **Step 4:** Implement `mulberry32` (algorithm below) with seed `0x5eed`; per base index `b`: count `30 + floor(rand() * 31)`; fan `n`: id `fan-${pad2(b+1)}-${pad3(n+1)}`, displayName from `GIVEN_NAMES[floor(rand()*len)]` + `FAMILY_NAMES[...]` (VN, ~12 each, hard-coded), username `${asciiGiven}.${pad2(b+1)}${pad3(n+1)}`, avatar from existing Unsplash `avatar()` pool when `rand() < 0.5`. Graph: `following` + `followers` maps mutated only through `link(a, b, on)`; seed from `SEED_FOLLOWING` & `SEED_FAN_FOLLOWS` at reset; lazy materialize unknown follower with `SEED_FOLLOWED_AUTHOR_IDS`

```ts
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```
- [x] **Step 5:** `npm run test` -> all PASS (existing graph consumers unchanged); typecheck exit 0
- [x] **Step 6:** Commit `feat(mocks): deterministic fans & bidirectional follow graph`

---

### Task 5: `user-service` - derived counts, actorId, profile/follow-list APIs

**Files:**
- Modify: `src/features/profile/services/user-service.ts`, `user-service.test.ts`, `src/features/profile/mocks/mock-users.ts`, `src/features/profile/types/index.ts`, `src/features/profile/index.ts`, callers' param names (`search-service.ts`, `follow-suggestions.tsx`, `explore-landing.tsx` - names only)

**Interfaces:**
- Consumes: Task 4 graph + `SEED_FANS`, `isFanId`; Task 3 `SEED_DEMO_ACCOUNT`; Task 1 `ForbiddenError`
- Produces (types, `profile/types`): `ProfileTab = "threads" | "replies" | "media" | "saved"`; `FollowListKind = "followers" | "following"`; `interface FollowListQuery { query?: string; page?: number }`; `interface FollowListPage { users: UserProfile[]; nextPage?: number }`; `interface ProfilePatch { displayName: string; bio?: string; avatarUrl?: string }`; `type ViewerUserInput = Pick<UserProfileBase, "id" | "username" | "displayName"> & Partial<Pick<UserProfileBase, "bio" | "avatarUrl">>`; `type StoredUser = Omit<UserProfileBase, "followersCount" | "followingCount">` (mock DB row, no counts); constants `PROFILE_DISPLAY_NAME_MIN = 2`, `PROFILE_DISPLAY_NAME_MAX = 50`, `PROFILE_BIO_MAX = 160`. `UserProfileBase` unchanged; `FollowerUser` removed in Task 13
- Produces (mocks): `MOCK_USERS: StoredUser[]` = authors + demo + fans; `HIDDEN_FOLLOWERS` / `HIDDEN_FOLLOWING: Readonly<Record<string, number>>` (= old EXTRAS counts; absent -> 0); `MOCK_USERS` is frozen (array + entries) & `db` is built from `structuredClone`s; `getSeedUserByUsername(username: string): StoredUser | undefined` (sync, pure, case-insensitive) reads ONLY immutable `MOCK_USERS` seed - NEVER `db`, never runtime users (D7: no server-side fake DB; runtime users resolve only via session cookie)
- Produces (service, all `actorId`): `FOLLOW_LIST_PAGE_SIZE = 20`; `searchUsers(query, actorId, limit?)`; `fetchSuggestedUsers(limit, actorId)` (excludes actor & fans); `fetchUser(id, actorId)`; `fetchUserByUsername(username, actorId): Promise<UserProfile | null>`; `fetchFollowedIds(actorId)`; `setFollow(id, following, actorId)`; `fetchFollowList(userId, kind, query: FollowListQuery, actorId): Promise<FollowListPage>`; `updateProfile(id, patch: ProfilePatch, actorId): Promise<UserProfile>`; `upsertViewerUser(user: ViewerUserInput, actorId): Promise<UserProfile>`

- [x] **Step 1: Failing tests** (extend; `beforeEach` resets users + graph): `fetchUser("author-01","v1")` -> `followersCount === HIDDEN_FOLLOWERS["author-01"] + getFollowerCount("author-01")` (read graph AFTER the call so `v1` is materialized); `setFollow("author-01", true, "v1")` -> `fetchUser("author-01","v1")` `followersCount` +1 & `getFollowingCount("v1")` +1; `"followersCount" in MOCK_USERS[0]` is false; existing `48_201` assertions rewritten as before/after delta of exactly 1; `fetchUserByUsername("AnQuoc.Dev","v1")` hit, `"nope"` -> null; `fetchFollowList("author-01","followers",{},"v1")` -> 20 users, `nextPage === 2`, base users before fans; `{ query: "linh" }` only matching names (diacritics-insensitive via `normalizeText`); legacy `"me"` never listed though counted; `fetchFollowList("author-01","following",{},"v1")` = `SEED_FOLLOWING["author-01"]` users; `updateProfile("1", { displayName: "New Name" }, "1")` returns updated, `updateProfile("1", ..., "me")` rejects `ForbiddenError`, displayName `"A"` / 51 chars / bio 161 chars reject `Error`; `upsertViewerUser({ id: "2", username: "new.user", displayName: "New" }, "2")` -> `fetchUserByUsername("new.user","2")` hit & `getFollowingCount("2") === SEED_FOLLOWED_AUTHOR_IDS.length`; `upsertViewerUser` for seed id `"author-01"` does not change its displayName; after `upsertViewerUser({ id: "2", username: "new.user", ... })` & `updateProfile("1", ...)`, `getSeedUserByUsername("new.user")` is undefined & `getSeedUserByUsername("ysocial_member").displayName` is still seed value; `fetchSuggestedUsers(50,"v1")` contains no fan
- [x] **Step 2:** `npm run test -- user-service` -> FAIL
- [x] **Step 3:** Implement. `project(user, actorId)` computes counts from graph + `HIDDEN_*`. `setFollow` ONLY calls `setFollowed`. `fetchFollowList`: ids from `getFollowerIds`/`getFollowedAuthorIds`, keep ids in `db`, filter tokens over `displayName username`, sort non-fans by `followersCount` desc then fans by id, slice page. `updateProfile` validates with constants, mutates `db` entry, returns projection. Rename all params to `actorId`; callers rename local vars only
- [x] **Step 4:** `npm run test` -> all PASS; typecheck exit 0
- [x] **Step 5:** Commit `feat(profile): graph-derived counts, follow lists & profile updates in user-service`

---

### Task 6: `user-store` - username index, patch, commitFollow; `FollowButton`; `ViewerSync`

**Files:**
- Create: `src/features/profile/components/viewer-sync.tsx`, `viewer-sync.test.tsx`
- Modify: `src/features/profile/store/user-store.ts`, `user-store.test.ts`, `src/features/profile/components/follow-button.tsx`, `follow-button.test.tsx`, `src/features/profile/index.ts`, `src/app/providers.tsx`

**Interfaces:**
- Consumes: Task 5 service fns & types; Task 3 `useAuthHydrated`, `useAuthUser`, `useActorId`, `toMockSession`
- Produces: data `idByUsername: Record<string, string>` (lowercase); actions `upsertUsers(users, actorId)` (maintains index), `toggleFollow(actorId, id)` (target followers ±1 & actor `followingCount` ±1 when actor cached; 1 `set()`), `patchUser(id: string, patch: ProfilePatch): void`; module fns `commitFollow(actorId: string, id: string): Promise<boolean>` (false = failed & reverted), `ensureUserByUsername(username: string, actorId: string): Promise<UserProfile | null>`, `refreshUsers(ids: string[], actorId: string): Promise<void>`, `ensureViewerUser(user: ViewerUserInput, actorId: string): Promise<UserProfile | null>` (1 shared promise per `user.id`: concurrent & later callers get same promise; rejected promise is evicted so retry can run); `toViewerUserInput(user: AuthUser): ViewerUserInput` in `profile/utils/viewer-user.ts` (username via `toMockSession`, `displayName ?? username`); selector `useUserByUsername(username: string): UserProfile | undefined`. `ensureUser(id, actorId)` unchanged behavior. `ViewerSync(): null` exported from `@/features/profile`

- [x] **Step 1: Failing tests** `user-store.test.ts`: `upsertUsers` fills `idByUsername["anquoc.dev"]`; `useUserByUsername("AnQuoc.Dev")` returns user; `patchUser("u1",{ displayName: "X" })` -> `useUser("u1").displayName === "X"`; `toggleFollow("a1","u1")` with actor `a1` cached -> `u1.followersCount +1` & `a1.followingCount +1` in 1 `set()`; `commitFollow` success -> `service.fetchUser` called for `["u1","a1"]` after `setFollow` resolves; **stale refetch skipped**: `commitFollow` twice before first `setFollow` resolves -> refetch only after second, final `isFollowing` = second click; `setFollow` rejects -> projection reverted & resolves `false`; `ensureUserByUsername` cache hit (no fetch) & concurrent calls share 1 request; `ensureViewerUser` concurrent + repeated calls with same id -> `upsertViewerUser` called once & every caller gets same resolved user; rejection -> next call retries
- [x] **Step 2: Failing tests** `viewer-sync.test.tsx`: before `hydrate()` -> `ensureViewerUser` not called; after `hydrate()` with stored user -> called once with `{ id, username, displayName }`; `updateUser` to different id -> called again; re-render same user -> not called again. `follow-button.test.tsx`: click calls `commitFollow`; failed commit -> `toast.error` with `t("card.followError")`
- [x] **Step 3:** `npm run test -- user-store viewer-sync follow-button` -> FAIL
- [x] **Step 4:** Implement. `commitFollow`: capture `version` after `toggleFollow`, `await setFollow(id, following, actorId)`, on success `if (version unchanged) await refreshUsers([id, actorId], actorId)`, on error `toggleFollow` back + return false. `FollowButton` uses `useActorId()` + `commitFollow`; keeps success toasts; error toast new key. `ViewerSync`: effect on `[hydrated, user?.id]` -> `ensureViewerUser(toViewerUserInput(user), actorId)`. Mount `<ViewerSync />` inside `Providers` (before `children`). i18n: `card.followError` vi "Không thể cập nhật theo dõi, thử lại nhé" / en "Couldn't update follow, try again"
- [x] **Step 5:** `npm run test` -> all PASS; typecheck exit 0.
- [x] **Step 6:** Commit `feat(profile): username index, commitFollow reconciliation & viewer sync`

---

### Task 7: `post-service` profile queries, demo content, pin selector

**Files:**
- Modify: `src/features/posts/types/index.ts`, `src/features/posts/mocks/mock-posts.ts`, `src/features/posts/services/post-service.ts`, `post-service.test.ts`, `src/features/posts/store/post-store.ts`, `post-store.test.ts`, `src/features/posts/index.ts`, `src/features/posts/components/post-feed.test.tsx` (count update)

**Interfaces:**
- Produces (types): `UserPostsTab = "threads" | "replies" | "media"`; `interface ParentReference { id: string; author?: PostAuthor; deleted: boolean }`; `interface UserPostsPage { posts: PostItem[]; parents: ParentReference[]; nextPage?: number }`; `interface SavedPostsPage { posts: PostItem[]; nextPage?: number }`
- Produces (service): `PROFILE_PAGE_SIZE = 10`; `fetchUserPosts(userId: string, tab: UserPostsTab, page: number): Promise<UserPostsPage>`; `fetchSavedPosts(actorId: string, page: number): Promise<SavedPostsPage>`
- Produces (store): `usePinnedPostId(authorId: string): string | undefined` (reads `pinnedIdByAuthor`)
- Barrel adds: `fetchUserPosts`, `fetchSavedPosts`, `PROFILE_PAGE_SIZE`, `usePinnedPostId`, `useIsDeleted`, `PostSkeletonList` (exists)

- [x] **Step 1:** Add demo content in `mock-posts.ts`: `RawPost.author: number | "demo"` (`"demo"` -> `SEED_DEMO_ACCOUNT`); roots `post-demo-01` (`minutesAgo: 90`, `isPinned: true`, text), `post-demo-02` (`minutesAgo: 1_300`, `imageUrls` 3 images), `post-demo-03` (`minutesAgo: 3_000`, `imageUrl`), `post-demo-04` (`minutesAgo: 4_000`, text with `#YSocial`); replies `reply-demo-01` -> `post-003` (`minutesAgo: 160`), `reply-demo-02` -> `post-006` (`minutesAgo: 380`)
- [x] **Step 2: Failing tests** `post-service.test.ts`: `fetchUserPosts("1","threads",1)` -> first post `post-demo-01` (pinned) then newest-first others, only roots by `"1"`; with pin moved to `post-demo-04` (`setPostPinned`) page 1 starts with `post-demo-04` & no page repeats it; `"replies"` -> only `parentId` posts by `"1"`, `parents` = `[{ id: "post-003", author: { username: "anquoc.dev", ... }, deleted: false }, ...]`; **deleted parent marker:** mock `deletePost` removes whole subtree, so a live reply with missing parent only happens with real BE soft-delete; simulate it with new test-only `__removePostOnly(id: string): void` (exported next to `__resetMockDb`, deletes 1 `db` entry): `__removePostOnly("post-003")` -> `fetchUserPosts("1","replies",1).parents` contains `{ id: "post-003", deleted: true }` with no `author` & `posts` still contains `reply-demo-01`; `"media"` -> only roots with images (`post-demo-02`, `post-demo-03` for `"1"`); paging: `PROFILE_PAGE_SIZE` slices + `nextPage`; `fetchSavedPosts("me",1)` -> only `isBookmarkedByCurrentUser`, newest first, includes replies when bookmarked. Existing `fetchFeed` "last page" assertion -> `toHaveLength(6)` (16 roots now)
- [x] **Step 3: Failing test** `post-store.test.ts`: `usePinnedPostId("1")` returns `post-demo-01` after `upsertPosts` of demo posts; `setPinned("post-demo-04", true)` -> `"post-demo-04"`
- [x] **Step 4:** `npm run test -- post-service post-store` -> FAIL
- [x] **Step 5:** Implement. Threads: `pinned = roots.find(isPinned && author)`; list = `[pinned, ...rest]`; slice. Replies parents: `db.get(parentId)` -> `{ id, author: copy(user), deleted: false }` else `{ id, deleted: true }`, deduped, only for posts in page. Update `post-feed.test.tsx:138` to `toHaveLength(16)`
- [x] **Step 6:** `npm run test` -> all PASS; typecheck exit 0
- [x] **Step 7:** Commit `feat(posts): profile tab & saved queries, parent references, demo content`

---

### Task 8: `PostCard` live author overlay (D12) & global composer controller

**Files:**
- Modify: `src/features/posts/components/post-card.tsx`, `post-card.test.tsx`, `src/lib/store/ui-store.ts`, `src/components/layout/main-layout.tsx`
- Create: `src/lib/store/ui-store.test.ts`

**Interfaces:**
- Consumes: Task 6 `useUser`, `patchUser`
- Produces: `ui-store` state `composerOpen: boolean`, actions `openComposer(): void`, `setComposerOpen(open: boolean): void`, selector `useComposerOpen(): boolean`. `MainLayout` binds its `PostCreatorDialog` to it (local `isCreateOpen` removed). Profile nav href: `useViewerId()` user -> `/@${username}`, guest -> `/login`

- [x] **Step 1: Failing tests** `post-card.test.tsx`: render card for `author-03`, then `useUserStore.getState().actions.upsertUsers([...])` + `patchUser("author-03", { displayName: "Quốc Mới" })` -> header shows "Quốc Mới" & avatar `alt` updates; author not in `user-store` -> snapshot `post.user.displayName` shown. `ui-store.test.ts`: `openComposer()` -> `composerOpen` true; `setComposerOpen(false)` -> false
- [x] **Step 2:** `npm run test -- post-card ui-store` -> FAIL
- [x] **Step 3:** Implement: in `PostCardView` `const author = useUser(live.user.id) ?? live.user;` & use `author` for avatar/name/username/verified (link + `UserHoverCard` ids unchanged). `MainLayout`: replace local state with `useComposerOpen()` + `setComposerOpen`; existing "new post" buttons call `openComposer()`
- [x] **Step 4:** `npm run test` -> all PASS; typecheck exit 0
- [x] **Step 5:** Commit `feat(posts): live author overlay & global composer controller`

---

### Task 9: Profile tab controller & pin ordering

**Files:**
- Create: `src/features/profile/hooks/use-profile-tab-posts.tsx`, `use-profile-tab-posts.test.tsx`, `src/features/profile/utils/order-with-pin.ts`, `order-with-pin.test.ts`

**Interfaces:**
- Consumes: Task 7 `fetchUserPosts`, `fetchSavedPosts`, `ParentReference`, `usePostActions().upsertPosts`
- Produces: `orderWithPin(ids: readonly string[], pinnedId: string | undefined): readonly string[]` (returns same reference when no change); `type TabStatus = "idle" | "loading" | "ready" | "error"`; `interface ProfileTabState { ids: string[]; parents: Record<string, ParentReference>; status: TabStatus; nextPage?: number }`; `useProfileTabPostsController(userId: string, actorId: string): ProfileTabPostsController` with `{ scopeKey: string; state: Record<ProfileTab, ProfileTabState>; activate(tab): void; loadMore(tab): void; retry(tab): void }`; `scopeKey = "<userId>:<actorId>"` - when it changes ALL tab state resets to `idle` & every request token is bumped (old-scope responses ignored), because Saved is actor-owned & like/bookmark flags are actor-scoped; `ProfileTabPostsProvider({ value, children })`; `useProfileTabPosts(tab: ProfileTab): { ids; parents; status; hasMore: boolean; loadMore(): void; retry(): void }` (calls `activate(tab)` in effect with deps `[tab, scopeKey]`, so the visible panel refetches after scope reset). `saved` tab -> `fetchSavedPosts(actorId, page)`, others -> `fetchUserPosts(userId, tab, page)`

- [x] **Step 1: Failing tests** `order-with-pin.test.ts`: `(["a","b","c"],"c")` -> `["c","a","b"]`; pinned absent -> same reference; `undefined` -> same reference; pinned already first -> same reference
- [x] **Step 2: Failing tests** `use-profile-tab-posts.test.tsx` (wrapper renders provider with controller): first mount of `threads` panel calls `fetchUserPosts` once & upserts posts into `post-store`; unmount + remount ONLY `threads` panel while provider/controller stays mounted -> no second call, ids kept; `loadMore` appends page 2 ids without duplicates; rejected fetch -> `status === "error"`, `retry()` refetches; **stale response ignored**: start `threads` (deferred promise), call `retry` (new request), resolve the first late -> ids from the second only; `replies` stores `parents` keyed by id; `saved` calls `fetchSavedPosts` with actorId, never `fetchUserPosts`; **actor A -> actor B:** Saved loaded for `"1"`, rerender controller with actorId `"2"` -> Saved ids cleared, `fetchSavedPosts("2", 1)` called, late response for `"1"` resolved afterwards is ignored
- [x] **Step 3:** `npm run test -- order-with-pin use-profile-tab-posts` -> FAIL
- [x] **Step 4:** Implement with `useReducer` (actions `reset()`, `start(tab, token)`, `success(tab, token, page, append)`, `failure(tab, token)`); on `scopeKey` change (previous key in ref) dispatch `reset` + bump all tokens; per-tab request token in `useRef<Record<ProfileTab, number>>`; dispatches ignored when token differs
- [x] **Step 5:** `npm run test` -> all PASS; typecheck exit 0
- [x] **Step 6:** Commit `feat(profile): tab posts controller & pin ordering`

---

### Task 10: Tab panels, reply context, media grid

**Files:**
- Create: `src/features/profile/components/profile-tab-panel.tsx`, `reply-context.tsx`, `profile-media-grid.tsx`, `profile-media-grid.test.tsx`, `profile-tab-panel.test.tsx`
- Modify: locales

**Interfaces:**
- Consumes: Task 9 `useProfileTabPosts`, `orderWithPin`; Task 7 `usePinnedPostId`, `useIsDeleted`, `usePost`, `PostCard`, `PostSkeletonList` (existing edge, non-new UI except already-imported `PostCard`/`PostSkeletonList`)
- Produces: `ProfileTabPanel({ tab: ProfileTab; userId: string; username: string; isOwn: boolean; onCreatePost(): void })` with `role="tabpanel"` + `aria-labelledby`; `ReplyContext({ parent: ParentReference })`; `ProfileMediaGrid({ ids: readonly string[]; username: string })`
- i18n `profile.*` add (vi / en): `emptyThreadsOwn` "Bạn chưa đăng thread nào" / "You haven't posted yet"; `emptyThreadsOwnCta` "Đăng thread đầu tiên" / "Post your first thread"; `emptyThreads` "@{username} chưa đăng thread nào" / "@{username} hasn't posted yet"; `emptyReplies` "Chưa có câu trả lời nào" / "No replies yet"; `emptyMedia` "Chưa có ảnh nào" / "No media yet"; `emptySaved` "Chưa lưu bài viết nào" / "Nothing saved yet"; `emptySavedHint` "Bấm biểu tượng dấu trang để lưu bài viết" / "Tap the bookmark icon to save posts"; `replyingTo` "Trả lời @{username}" / "Replying to @{username}"; `parentDeleted` "Bài viết gốc đã bị xóa" / "The original post was deleted"; `mediaAlt` "Ảnh trong bài viết của @{username}" / "Image from @{username}'s post"; `mediaMulti` "Bài viết có nhiều ảnh" / "Post with multiple images"; `tabError` "Không tải được nội dung" / "Couldn't load this tab"

- [x] **Step 1: Failing tests** `profile-media-grid.test.tsx`: given posts with/without images upserted -> only image posts render; each tile is link to `/posts/<id>`; multi-image tile shows badge with `aria-label` `mediaMulti`; every `img` has non-empty `alt`. `profile-tab-panel.test.tsx`: Threads pinned post rendered first & re-ordered after `setPinned` on another post; tombstoned id not rendered; Replies shows `replyingTo` link to `/posts/<parentId>` & `parentDeleted` for `{ deleted: true }`; own empty Threads CTA click calls `onCreatePost`; error status -> `tabError` + Retry calls `retry`; sentinel intersection calls `loadMore` (mock `IntersectionObserver`)
- [x] **Step 2:** `npm run test -- profile-media-grid profile-tab-panel` -> FAIL.
- [x] **Step 3:** Implement. Lists reuse `PostFeed` sentinel pattern (IntersectionObserver, `rootMargin: "600px"`). Grid: `grid grid-cols-3 gap-0.5`, tile `aspect-square overflow-hidden`, `<img loading="lazy" decoding="async" className="size-full object-cover">` preceded by `// eslint-disable-next-line @next/next/no-img-element -- remote/blob post images, no next/image remote config (spec D16)`. Empty states via `EmptyState` (`MessageSquare`, `Reply`, `Image`, `Bookmark`)
- [x] **Step 4:** `npm run test` -> all PASS; typecheck exit 0; `npx eslint src/features/profile` -> no new warnings
- [x] **Step 5:** Commit `feat(profile): threads/replies/media/saved panels`

---

### Task 11: Profile container, header, tabs, edit dialog

**Files:**
- Create: `src/features/profile/components/profile-container.test.tsx`
- Modify: `profile-container.tsx` (rewrite), `profile-header.tsx`, `profile-tabs.tsx`, `edit-profile-dialog.tsx`, `src/lib/i18n/translate.ts` (`share.*` domain in `TranslationKey`), `src/app/[@username]/page.tsx` (thin render only: drop `fetch`/`BASE_URL`/dev branch, render `<ProfileContainer key={username} username={username} />` with `normalizeUsername` inline until Task 12), locales
- Create: `src/features/profile/components/profile-skeleton.tsx`

**Interfaces:**
- Consumes: Tasks 3, 6, 8, 9, 10
- Produces: `ProfileContainer({ username })`; `ProfileHeader({ user: UserProfile; isOwn: boolean; onOpenFollowers(kind: FollowListKind): void; onShare?: (action: "copy" | "qr") => void })` (Share menu rendered only when `onShare` is passed; container passes it from Task 14); `ProfileTabs({ active: ProfileTab; onChange(tab): void; showSaved: boolean })` with roving `tabIndex` + ArrowLeft/ArrowRight/Home/End; `EditProfileDialog({ open; onOpenChange; user: UserProfile })`. Panels rendered via `ProfileTabPanel` (Task 10)
- i18n `profile.*` add (vi / en): `tabThreads` "Thread" / "Threads"; `tabReplies` "Trả lời" / "Replies"; `tabMedia` "File phương tiện" / "Media"; `tabSaved` "Đã lưu" / "Saved"; `followersCount` "{n} người theo dõi" / "{n} followers"; `followingCount` "{n} đang theo dõi" / "{n} following"; `editProfile` "Chỉnh sửa trang cá nhân" / "Edit profile"; `editSave` "Lưu" / "Save"; `editCancel` "Hủy" / "Cancel"; `editDisplayName` "Tên hiển thị" / "Display name"; `editBio` "Tiểu sử" / "Bio"; `editAvatarUrl` "Ảnh đại diện (URL)" / "Avatar URL"; `errorDisplayNameMin` "Tên hiển thị phải từ {n} ký tự" / "Display name needs at least {n} characters"; `errorDisplayNameMax` "Tên hiển thị tối đa {n} ký tự" / "Display name is at most {n} characters"; `errorBioMax` "Tiểu sử tối đa {n} ký tự" / "Bio is at most {n} characters"; `errorAvatarUrl` "Đường dẫn ảnh không hợp lệ" / "Invalid image URL"; `editSuccess` "Đã cập nhật trang cá nhân" / "Profile updated"; `editError` "Không lưu được, thử lại nhé" / "Couldn't save, try again"; `shareProfile` "Chia sẻ trang cá nhân" / "Share profile"; `desyncTitle` "Phiên đăng nhập đã thay đổi" / "Your session changed"; `desyncAction` "Tải lại" / "Reload". `share.*` (new domain): `copyLink` "Sao chép liên kết" / "Copy link"; `showQr` "Mã QR" / "QR code"; `copied` "Đã sao chép liên kết" / "Link copied"; `copyFailed` "Không sao chép được, hãy copy thủ công" / "Couldn't copy, copy it manually"; `qrTitle` "Mã QR của @{username}" / "@{username}'s QR code"; `downloadPng` "Tải PNG" / "Download PNG"; `downloadFailed` "Không tải được ảnh QR" / "Couldn't download the QR image"

- [x] **Step 1: Failing tests** `profile-container.test.tsx`: before `hydrate()` -> skeleton (`data-testid="profile-skeleton"`), no not-found text; guest (hydrated, no user) on `/@ysocial_member` -> no Saved tab, no Edit button (actor is `"me"` yet NOT own); after `updateUser(demo)` + hydrate -> Saved tab & Edit visible; tabs keyboard: ArrowRight moves focus & selection; Edit submit -> `updateProfile` called with `("1", patch, "1")` & header name updates via store; edit with 1-char name shows `errorDisplayNameMin`; follow from header -> `commitFollow`; desync: hydrated, `username` is not signed-in user & `fetchUserByUsername` -> null -> inline `desyncTitle` + Reload button calling `router.refresh`; **register -> F5 no desync:** localStorage holds runtime user `{ id: "2", username: "new.user" }` (not in user-service), `fetchUserByUsername` spied to resolve null & `upsertViewerUser` delayed 500ms, render `<Providers><ProfileContainer username="new.user" /></Providers>` -> skeleton, then header shows `new.user`; `desyncTitle` never rendered; `upsertViewerUser` called once
- [x] **Step 2:** `npm run test -- profile-container` -> FAIL
- [x] **Step 3:** Implement `ProfileSkeleton` (`data-testid="profile-skeleton"`; header: avatar `size-20` circle right, name `h-7 w-40`, username `h-4 w-24`, bio 2 lines, counts row, action button `h-9 w-full`; tabs bar `h-12`; `PostSkeletonList count={3}`). Container: `hydrated` gate; lookup in effect: IF signed-in `authUser` & `toViewerUserInput(authUser).username === username` -> `ensureViewerUser(toViewerUserInput(authUser), actorId)` (same shared promise as `ViewerSync`, so runtime user is upserted before it is read) ELSE `ensureUserByUsername(username, actorId)`; desync state ONLY when that lookup resolves null; `isOwn = viewerId !== null && viewerId === user.id`; controller + provider; dialogs state; `onCreatePost={openComposer}`; `key` reset comes from page. Header uses `FollowButton` (hidden when `isOwn`), Share `DropdownMenu` (`Share2`, `aria-label={t("profile.shareProfile")}`), counts as buttons (`min-h-11`). Edit dialog: Zod schema built from Task 5 constants + i18n messages; submit -> `updateProfile` -> `patchUser` -> toast. Remove `useQuery`, `apiClient`, inline mocks, every `any`
- [x] **Step 4:** `npm run test` -> all PASS; typecheck exit 0; `grep -n "apiClient\|: any\|as any" src/features/profile -r` -> 0
- [x] **Step 5:** Commit `feat(profile): mock-backed profile container, header, tabs & edit`

---

### Task 12: Profile route (server resolution, metadata, not-found/error/loading)

**Files:**
- Create: `src/features/profile/utils/resolve-profile-route.ts`, `resolve-profile-route.test.ts`, `src/app/[@username]/not-found.tsx`, `error.tsx`, `page.test.tsx` (`loading.tsx` dropped during execution: it makes `notFound()` answer HTTP 200)
- Modify: `src/app/[@username]/page.tsx`, `src/features/profile/index.ts`, locales

**Interfaces:**
- Consumes: Task 2 `parseMockSession`, `MOCK_SESSION_COOKIE`; Task 5 `getSeedUserByUsername`; Task 1 `translate`; Task 11 `ProfileContainer({ username })`, `ProfileSkeleton`
- Produces: `normalizeUsername(raw: string): string` (`decodeURIComponent` in try/catch - malformed input keeps raw string, never throws; strip leading `@`; lowercase); `type ProfileRouteResolution = { kind: "seed"; user: UserProfileBase } | { kind: "session"; identity: MockSessionIdentity } | null`; `resolveProfileRoute(username: string, session: MockSessionIdentity | null): ProfileRouteResolution` (seed wins over session); `user: StoredUser` for seed.
- i18n `profile.*` add: `metaTitle` vi/en `"{name} (@{username}) • YSocial"`; `metaTitleRuntime` `"@{username} • YSocial"`; `metaDescription` vi `"Xem bài viết, câu trả lời và nội dung của @{username} trên YSocial."` / en `"See posts, replies & media from @{username} on YSocial."`; `notFoundTitle` vi `"Người dùng không tồn tại"` / en `"This account doesn't exist"`; `notFoundDescription` vi `"Liên kết có thể đã hỏng hoặc tài khoản đã bị xóa."` / en `"The link may be broken or the account was removed."`; `notFoundMeta` vi `"Không tìm thấy người dùng • YSocial"` / en `"User not found • YSocial"`; `backHome` vi `"Về trang chủ"` / en `"Back to Home"`; `loadError` vi `"Không tải được trang cá nhân"` / en `"Couldn't load this profile"`; `retry` vi `"Thử lại"` / en `"Try again"`

- [x] **Step 1: Failing tests** `resolve-profile-route.test.ts`: `"anquoc.dev"`, `"@anquoc.dev"`, `"%40AnQuoc.Dev"` -> seed; session `{ id: "2", username: "new.user" }` + `"new.user"` -> `{ kind: "session" }`; same session + `"other.user"` -> null; null session + `"nope"` -> null; seed username with session of same name -> seed; `normalizeUsername("%E0%A4%A")` does not throw & resolves null
- [x] **Step 2: Failing tests** `page.test.tsx` (`vi.mock("next/headers")` cookies returning store with `get`; `vi.mock("next/navigation")` `notFound` throws `Error("NEXT_NOT_FOUND")`): runtime user A cookie + `/@a.user` -> resolves JSX (no throw); A cookie + `/@b.user` -> throws NEXT_NOT_FOUND; malformed cookie + `/@nope` -> throws; `generateMetadata` seed -> title `Trần Anh Quốc (@anquoc.dev) • YSocial` + OG `type: "profile"` + image avatar; runtime -> title `@a.user • YSocial`, no `openGraph.images`; unknown -> `notFoundMeta` title; malformed `%E0%A4%A` username: `generateMetadata` resolves (no throw) with `notFoundMeta` title, & separately page throws NEXT_NOT_FOUND.
- [x] **Step 3:** `npm run test -- resolve-profile-route page` -> FAIL
- [x] **Step 4:** Implement `page.tsx` (`await params`, `const raw = (await cookies()).get(MOCK_SESSION_COOKIE)?.value`, parse, resolve, `notFound()`), remove `BASE_URL`/fetch/dev branch. `loading.tsx` renders `ProfileSkeleton`; page passes `normalizeUsername(raw)` to container (replaces Task 11 inline decode). `not-found.tsx`: `EmptyState` `UserX` + `Link` Home (server: `translate(DEFAULT_LOCALE, ...)`). `error.tsx` (client): `EmptyState` `AlertCircle` + `reset()` button
- [x] **Step 5:** `npm run test` -> all PASS; typecheck exit 0
- [x] **Step 6:** Commit `feat(profile): server-resolved profile route with real 404`

---

### Task 13: Followers / following dialog on mocks

**Files:**
- Modify: `src/features/profile/components/followers-dialog.tsx` (rewrite), locales
- Create: `src/features/profile/components/followers-dialog.test.tsx`

**Interfaces:**
- Consumes: Task 5 `fetchFollowList`, `FOLLOW_LIST_PAGE_SIZE`; Task 6 `upsertUsers`, `commitFollow`, `FollowButton`, `UserHoverCard`
- Produces: `FollowersDialog({ open; onOpenChange; userId: string; username: string; initialKind: FollowListKind })`; `FOLLOW_SEARCH_DEBOUNCE_MS = 250`
- i18n `profile.*` add: `followSearchPlaceholder` "Tìm kiếm" / "Search"; `followNoMatch` "Không tìm thấy ai khớp với \"{query}\"" / "No one matches \"{query}\""; existing `followersTitle`, `followingTitle`, `emptyFollowers`, `emptyFollowing`, `unfollowConfirm*` reused

- [x] **Step 1: Failing tests:** open on `followers` -> 20 rows from service then scrolling sentinel loads page 2; switching to `following` tab fetches `following` list; typing "linh" (fake timers, advance 250ms) refetches with `{ query: "linh", page: 1 }`, earlier in-flight response ignored; no-match -> `followNoMatch`; follow a row -> header-independent assertion: `useUserStore` target `followersCount` +1; actor's own row has no Follow button; clicking a name link calls `onOpenChange(false)`; unfollow asks confirmation first
- [x] **Step 2:** `npm run test -- followers-dialog` -> FAIL
- [x] **Step 3:** Implement with `Tabs`, `ScrollArea`, request token for stale responses, rows using `FollowButton` (store-bound; unfollow confirm via existing `AlertDialog` copy wrapping `commitFollow`). Remove hardcoded lists & `FollowerUser` usage
- [x] **Step 4:** `npm run test` -> all PASS; typecheck exit 0
- [x] **Step 5:** Commit `feat(profile): store-bound followers dialog with search & paging`

---

### Task 14: Share profile (copy link + QR)

**Files:**
- Create: `src/features/profile/components/share-profile-dialog.tsx`, `share-profile-dialog.test.tsx`
- Modify: `package.json`, `package-lock.json`, `profile-container.tsx` (wire `onShare`), `profile-header.tsx` (menu already emits)

**Interfaces:**
- Consumes: Task 11 `ProfileHeader` `onShare` prop (container starts passing it here)
- Produces: `copyProfileLink(username: string): Promise<boolean>` (in `profile/utils/share.ts`; URL `${window.location.origin}/@${username}`); `ShareProfileDialog({ open; onOpenChange; user: UserProfile })`; `QR_SIZE = 220`, `QR_AVATAR_SIZE = 44`, `QR_LEVEL = "M"`

- [x] **Step 1:** Dependency already approved. Run `npm install qrcode.react@^4.2.0`; `npm ls qrcode.react` shows `4.2.x`
- [x] **Step 2: Failing tests:** dialog renders `svg` QR; Copy calls `navigator.clipboard.writeText("http://localhost:3000/@anquoc.dev")` (jsdom origin) & toasts `share.copied`; icon swaps to check then back after 1500ms; clipboard reject -> toast `share.copyFailed` &he readonly link input is focused & selected; Download with avatar: `HTMLCanvasElement.prototype.toDataURL` mocked -> anchor `download="ysocial-anquoc.dev-qr.png"` clicked once & `QRCodeCanvas` received `imageSettings.crossOrigin === "anonymous"` (assert via `vi.mock("qrcode.react")` capturing props); **SecurityError fallback:** first `toDataURL` throws `DOMException("x","SecurityError")`, second succeeds -> still 1 download, second render has no embedded image; both throw -> toast `share.downloadFailed`
- [x] **Step 3:** `npm run test -- share-profile-dialog` -> FAIL
- [x] **Step 4:** Implement: visible `QRCodeSVG` (`bgColor="#ffffff"`, `fgColor="#18181b"`, white card `rounded-2xl p-4` in both themes, `imageSettings: { src: avatarUrl, height: QR_AVATAR_SIZE, width: QR_AVATAR_SIZE, excavate: true }` only when avatar exists); hidden `QRCodeCanvas` (`ref`, same props; `imageSettings: { ...same, crossOrigin: "anonymous" }` - `crossOrigin` lives INSIDE `imageSettings`, it is not top-level prop); download: try `toDataURL("image/png")`, on `SecurityError` set `withAvatar=false`, wait 1 frame for re-render, retry once. Header dropdown "copy" calls `copyProfileLink` directly; "qr" opens dialog
- [x] **Step 5:** `npm run test` -> all PASS; typecheck exit 0
- [x] **Step 6:** Commit `feat(profile): share profile link & QR code` (includes `package.json`/lock)

---

### Task 15: Verification & close-out

**Files:**
- Create: `.context/features/profile.md`
- Modify: `.context/INDEX.md`, `.context/roadmap.md`, this plan (checkboxes), spec status line

- [x] **Step 1:** `npm run test` (report files/tests), `npm run typecheck` (exit 0), `npx eslint src -f json` summarized per file + rule & diffed against Appendix A: no file/rule count increased; list every decrease (expected: profile files cleaned, `use-translation.ts` `no-explicit-any` gone, `[@username]/page.tsx` warning gone)
- [x] **Step 2: Greps** (expect 0 unless noted): `grep -rn "apiClient" src/features/profile`; `grep -rn "PostCreatorDialog" src/features/profile`; `grep -rn "useViewerId" src/features/posts`; `grep -rn "viewerId" src/features/profile/services src/features/profile/store`; `grep -rn "useViewerId" src/features/profile` -> only `profile-container.tsx` (+ tests) - review each hit is identity check
- [x] **Step 3: Browser pane** (`npm run dev` via preview, `http://localhost:3000`): register runtime user -> own profile -> hard refresh (no hydration warning in console) -> `/@khong-ton-tai` (network status 404) -> logout -> same runtime username -> 404. Then login -> `/@ysocial_member`: 4 tabs, pinned first, Media grid, Saved; `/@anquoc.dev`: follow -> feed/hover card/header counts sync; followers dialog search + paging; Share copy + QR PNG download (Unsplash avatar); 375 / 768 / 1440 px, light & dark, keyboard tab navigation; `ui-ux-pro-max` Pre-Delivery Checklist. Screenshot proof
- [x] **Step 4:** Write `.context/features/profile.md` (as-built: data flow, identity split, cookie bridge limits, counts rule, D17 boundary, pitfalls found), add to `INDEX.md`, roadmap: F0.6, 2.1, 2.2, 2.6 `[x]`, F0.4 & 7.7 `/@username` done, gap #2 profile part done, Phase 2 note "2A done". Spec status -> implemented
- [x] **Step 5:** Commit `docs(profile): as-built profile core & roadmap status`

---

## Appendix A - ESLint baseline (`main` @ `6452425`, 62 E / 25 W)

Format: `rule severity x count` (E = error, W = warning)

- `src/app/[@username]/page.tsx`: @typescript-eslint/no-unused-vars Wx1
- `src/components/shared/safe-hydration.tsx`: react-hooks/set-state-in-effect Ex1
- `src/features/auth/components/login-form.tsx`: @next/next/no-html-link-for-pages Ex1, @next/next/no-img-element Wx3, @typescript-eslint/no-unused-vars Wx2
- `src/features/auth/components/register-form.tsx`: @next/next/no-html-link-for-pages Ex1
- `src/features/auth/types/index.ts`: @typescript-eslint/no-explicit-any Ex5
- `src/features/notifications/components/notification-list.tsx`: @typescript-eslint/no-explicit-any Ex1
- `src/features/posts/components/post-creator-core.tsx`: @next/next/no-img-element Wx2, @typescript-eslint/no-explicit-any Ex1, @typescript-eslint/no-unused-vars Wx1
- `src/features/posts/components/post-creator-dialog.tsx`: @typescript-eslint/no-explicit-any Ex1
- `src/features/posts/components/post-lightbox.tsx`: @next/next/no-img-element Wx1
- `src/features/posts/components/post-media-grid.tsx`: @next/next/no-img-element Wx5
- `src/features/posts/store/post-draft-store.ts`: prefer-const Ex1
- `src/features/profile/components/edit-profile-dialog.tsx`: @typescript-eslint/no-explicit-any Ex1, @typescript-eslint/no-unused-vars Wx1
- `src/features/profile/components/followers-dialog.tsx`: @typescript-eslint/no-unused-vars Wx2
- `src/features/profile/components/profile-container.tsx`: @typescript-eslint/no-explicit-any Ex2, @typescript-eslint/no-unused-vars Wx2, react-hooks/purity Ex2, react-hooks/set-state-in-effect Ex1
- `src/features/profile/components/profile-header.tsx`: @typescript-eslint/no-unused-vars Wx1
- `src/features/profile/components/profile-tabs.tsx`: @typescript-eslint/no-unused-vars Wx1
- `src/features/saved/components/saved-command-bar.tsx`: @typescript-eslint/no-explicit-any Ex9
- `src/features/saved/components/saved-list.tsx`: @typescript-eslint/no-explicit-any Ex22, @typescript-eslint/no-unused-vars Wx3
- `src/hooks/use-mobile.ts`: react-hooks/set-state-in-effect Ex1
- `src/hooks/use-translation.ts`: @typescript-eslint/no-explicit-any Ex1
- `src/lib/api-client.ts`: @typescript-eslint/no-explicit-any Ex10
- `src/lib/signalr-client.ts`: @typescript-eslint/no-explicit-any Ex1

## Execution notes (2026-10-08)

- All tasks done on `feature/profile-core`; rulings & final-review fixes (second register, register username shape) are in `.context/features/profile.md` (pitfall log)

## Deferred minors resolution (2026-10-09)

All 5 resolved via TDD (RED test per fix, suite 56 files / 527 tests, `tsc` exit 0, eslint 55 E / 17 W, no file/rule increase vs Appendix A). Final self + advisor review caught regression in StrictMode fix before commit:

- [x] **QRCodeCanvas re-key on retry** (`share-profile-dialog.tsx`): `key={withAvatar ? "qr-avatar" : "qr-plain"}` forces fresh `<canvas>` on no-avatar retry (redraw into same element keeps tainted canvas tainted in real browser)
- [x] **`commitFollow` refetch version re-check** (`user-store.ts`): `refreshUsers` takes optional `shouldApply()` guard, re-checked before upsert; `commitFollow` passes it so toggle landing while refetch is in flight is not overwritten by stale response
- [x] **Edit dialog upserts service projection** (`edit-profile-dialog.tsx`): `onSubmit` now upserts `updateProfile`'s return value (`upsertUsers`) instead of hand-built local patch & syncs auth store from that same return value. Deviates from Task 11 Step 4's `patchUser` call - `patchUser` action has no production caller left (kept as store action; still covered by its own `user-store.test.ts` case)
- [x] **Followers dialog error state** (`followers-dialog.tsx`): first-page failure now renders `tabError` + retry (was falling through to generic empty state); failed `loadMore` stops observing sentinel & shows inline retry row instead of letting still-visible sentinel re-fire request every re-render. New UI, verified by tests (mock-forced failures) only
- [x] **StrictMode double fetch** (`use-profile-tab-posts.tsx`): `activate` gates on `activatedScope` ref (per tab, keyed by `scopeKey`) set synchronously before async fetch starts, since StrictMode's mount-cleanup-mount runs both invocations before `start` dispatch commits non-idle status.
  - **Ruling:** comparing `scopeKey` alone is not enough - scope revisited A -> B -> A kept stale guard value, which matched new key again, so tab never refetched (hit production, e.g. logout/login back to same account while Saved was open). Fixed: reset `activatedScope` per tab in same branch that bumps `tokens` on scope change; regression test added (`1:1 -> 1:2 -> 1:1` must refetch). `followers-dialog.tsx`'s first-page effect has same StrictMode class of issue (1 wasted dev-only request, hidden by its token guard, not correctness bug) - out of scope, noted in `.context/features/profile.md` pitfall log for future pass
