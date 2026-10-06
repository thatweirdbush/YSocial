# Search / Explore & Hashtag Page - Design Spec

- **Date:** 2026-10-05
- **Status:** approved in brainstorming, pending spec review
- **Roadmap:** `.context/features/frontend-roadmap.md` -> Phase 1.2 (Search / Explore) + Phase 1.3 (Hashtag page), merged; also closes F0.2 "users" part
- **Scope rule:** FE ONLY. NO BE/API/DB calls in any new/touched flow; all data from in-repo mocks.

## 1. Goal

- Nav `/search` (currently 404) -> real search & explore page: tabs Top / Người dùng / Bài viết / Hashtag, recent searches, debounced suggestions, keyword highlight
- `/tags/[tag]` page: posts containing a hashtag, Top / Mới nhất
- `#tag` & `@username` in post content become links; sidebar `SearchWidget`, `TrendingWidget`, `FollowSuggestions` wired to real mock data
- Like/bookmark/follow state consistent across feed, detail, search, tag page, sidebar

## 2. Decisions (from brainstorming)

| # | Decision | Choice |
|---|---|---|
| D1 | Scope | 1.2 + 1.3 in one spec (shared hashtag extraction + search service) |
| D2 | User data | Lives in `features/profile` (mocks + `user-service` + `user-store`); `FollowSuggestions` migrated to it |
| D3 | Empty `/search` | Explore landing: recent searches, trending hashtags, suggested users |
| D4 | Search box | Shared `SearchBox` combobox for `/search` & sidebar; dropdown = recent (empty input) or suggestions (debounce 250ms); sidebar widget hidden on `/search` |
| D5 | URL state | `?q=...&tab=top|users|posts|tags`; tab change -> `router.replace`, new query -> `router.push` |
| D6 | Matching | Case & diacritics insensitive; multi-token AND; `#x` -> default tab `tags`, `@x` -> default tab `users`; root posts ONLY (no replies) |
| D7 | Top tab | <= 3 users + "Xem tất cả" -> tab users, then posts by relevance then likes |
| D8 | Paging | None; cap 50 results per kind. Service returns arrays so paging can be added without UI change |
| D9 | Linkify | `#tag` -> `/tags/[tag]`, `@username` -> `/@username` in `PostCard`; link click never opens thread |
| D10 | Tag page | Header `#tag` + post count, tabs Top / Mới nhất, `generateMetadata`, `loading`/`error`; 0 posts -> `EmptyState` (NOT 404); `TrendingWidget` from mock counts |
| D11 | Recent searches | Max 10, dedupe (move to top), remove one / clear all; Zustand `persist` + `skipHydration`, rehydrate after mount |
| D12 | Data layer | Approach A: mock services + normalized Zustand stores (same as post detail). Rejected: TanStack `useQuery` (2 state sources, breaks sync), client filter over `post-store` (misses unloaded posts) |

## 3. Global Constraints

- Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, Zustand 5, shadcn/Radix, Lucide. **NO new deps** (runtime or dev).
- Files/dirs `kebab-case`; components `PascalCase`; vars/functions `camelCase`; CRLF line endings.
- Domain types in `features/<feature>/types/index.ts`; cross-feature imports ONLY via `@/features/<feature>` or `@/features/<feature>/types`.
- Pages = thin Server Component wrappers; metadata in `page.tsx`.
- All strings via `useTranslation()`, keys in `vi.json` & `en.json` (NO `as any`).
- Touch targets >= 44px; icon-only buttons have `aria-label`; transitions 150-300ms, `motion-reduce` respected.
- SSR-safe stores: NEVER read `localStorage` in initializer (FE convention 4).

## 4. Architecture & Data Flow

```
SearchContainer / TagContainer / ExploreLanding / SearchBox
        |  calls
        v
search-service (features/search) ──> post-service.searchPosts / fetchPostsByTag / fetchTrendingTags
                                 └─> user-service.searchUsers / fetchSuggestedUsers
        |  returns entities
        v
upsertPosts (post-store) + upsertUsers (user-store) + setResult cache (search-store)
        |
usePost(id) / useUser(id)  ->  PostCard / UserResultRow / FollowButton
```

- `search-service` is orchestration ONLY (no own DB). It calls `post-service` & `user-service` through feature barrels.
- Swap point for real API: service bodies ONLY; containers & stores unchanged.

### 4.1 Shared utils

`src/lib/text.ts`
```ts
export function normalizeText(input: string): string;   // NFD, strip \p{M}, đ/Đ -> d, lowercase, trim, collapse spaces
export function tokenize(input: string): string[];      // normalizeText -> split on whitespace, drop empty
export function extractHashtags(content: string): string[]; // /#([\p{L}\p{N}_]+)/gu, original casing, in order, deduped by normalized form
export const HASHTAG_PATTERN: RegExp;                   // /(?<=^|\s)#([\p{L}\p{M}\p{N}_]+)/gu - start or after whitespace (never URL fragments / ids), \p{M} keeps NFD marks
export const MENTION_PATTERN: RegExp;                   // /(?<=^|\s)@([a-zA-Z0-9._]*[a-zA-Z0-9_])/g - ASCII, trailing `.` excluded
```

`src/hooks/use-debounced-value.ts` - `useDebouncedValue<T>(value: T, delayMs: number): T`

`src/components/shared/highlight-text.tsx` - `<HighlightText text tokens />`: wraps substrings whose normalized form matches any token in `<mark>` (zinc-tinted, `bg-zinc-200/70 dark:bg-zinc-700/60 text-inherit rounded-sm`). Matching is diacritics-insensitive: builds a normalized char-index map so highlighted ranges map back to the original string. Pure, no domain logic.

### 4.2 Profile feature (users)

Types (`features/profile/types/index.ts`) - reuse `UserProfile` (already has `followersCount`, `followingCount`, `isFollowing`, `isVerified`, `bio`).

`features/profile/mocks/mock-users.ts`
- `MOCK_USERS: UserProfile[]` - 8 users, SAME `id`/`username`/`displayName`/`avatarUrl`/`isVerified` as `MOCK_AUTHORS` (built from it via `@/features/posts`, plus per-user `bio`, `followersCount`, `followingCount`)
- `isFollowing` = `MOCK_FOLLOWED_AUTHOR_IDS.includes(id)` -> "following" feed tab & follow buttons agree
- Export `MOCK_FOLLOWED_AUTHOR_IDS` from posts barrel (needed here)

`features/profile/services/user-service.ts`
```ts
export async function searchUsers(query: string, limit?: number): Promise<UserProfile[]>;
export async function fetchSuggestedUsers(limit: number): Promise<UserProfile[]>; // not followed, by followersCount desc
export async function setFollow(id: string, following: boolean): Promise<void>;   // idempotent, applied before latency
export function __resetMockUsers(): void;                                        // test-only
```
- In-memory DB cloned from `MOCK_USERS`; same `mockDelay` 300-600ms pattern as `post-service`
- `searchUsers`: every token must be contained in `normalizeText(displayName + " " + username + " " + bio)`; sort: username starts with first token -> first, then `followersCount` desc; leading `@` stripped from query

`features/profile/store/user-store.ts`
```ts
users: Record<string, UserProfile>
actions: upsertUsers(users), toggleFollow(id)   // isFollowing flip, followersCount ±1 (>= 0); unknown id -> no-op
selectors: useUser(id), useUserActions()
resetUserStore()                                // test-only
```

`features/profile/components/follow-button.tsx` - `<FollowButton userId size? />`: reads `useUser(id)`, calls `toggleFollow` then `setFollow(id, next)`; toast on follow (existing `FollowSuggestions` behavior); `aria-pressed`. Visual = current `FollowSuggestionItem` button.

Barrel `features/profile/index.ts` adds: `FollowButton`, `useUser`, `useUserActions`, `searchUsers`, `fetchSuggestedUsers`, `setFollow`.

`FollowSuggestions` (sidebar): fetch `fetchSuggestedUsers(3)` once on mount -> `upsertUsers` -> rows render `useUser(id)` + `FollowButton`. Keeps the user in the list after following (no reshuffle). Skeleton rows while loading.

### 4.3 Posts feature additions

`post-service.ts`
```ts
export async function searchPosts(query: string, limit?: number, sort?: PostSearchSort): Promise<PostItem[]>; // roots only; "relevance" (default) | "latest"
export async function fetchPostsByTag(tag: string, sort: TagSort): Promise<TagPage>;
export async function fetchTrendingTags(limit: number): Promise<HashtagStat[]>;
```
- Types (`posts/types`): `TagSort = "top" | "latest"`, `HashtagStat { tag: string; postsCount: number }`, `TagPage { tag: string; postsCount: number; posts: PostItem[] }`
- Search runs over the live in-memory `db` -> session-created posts & persisted likes included
- **Relevance score** (`searchPosts`): post matches IF every token is contained in `normalizeText(content + " " + displayName + " " + username)`; score = Σ occurrences of tokens in normalized content + 2 × (tokens matched in author name/username); order: score desc, `likesCount` desc, newest
- Query starting with `#`: match posts whose `extractHashtags` contains the normalized tag (exact tag, not substring)
- `fetchPostsByTag`: exact normalized-tag match; `top` = likes desc then newest, `latest` = newest; `tag` field = most frequent original casing among matches (fallback: input); `postsCount` = total matches; cap 50
- `fetchTrendingTags`: count root posts per normalized tag, return most frequent casing, sort count desc then tag asc
- `mocks/mock-posts.ts`: `getMockTagStat(tag)` (sync, seed only) for tag page `generateMetadata`
- Seed: add hashtags & mentions to ~8 existing root posts (e.g. `#NextJS`, `#Minimalism`, `#ĐàLạt`, `#Zustand`, `#DarkMode`, `#VietCode`) so search, trending & tag page have data; keep ids, counts and existing test expectations stable

`features/posts/utils/rich-content.tsx`
```tsx
export function RichContent({ content, highlightTokens }: { content: string; highlightTokens?: string[] }): JSX.Element;
```
- Splits by combined hashtag/mention pattern -> `<Link href="/tags/{encodeURIComponent(tag)}">#tag</Link>`, `<Link href="/@username">@username</Link>`, text segments through `HighlightText` when tokens given
- Links: `onClick={e => e.stopPropagation()}` -> parent content `openThread` never fires; styled `font-medium text-zinc-950 dark:text-zinc-50 hover:underline`
- `@mention` ALWAYS linked (posts feature does not know the users list); profile route handles unknown username
- `PostCard` content renders `<RichContent content={live.content} highlightTokens={highlightTokens} />`; new optional prop `highlightTokens?: string[]`

Barrel `features/posts/index.ts` adds: `searchPosts`, `fetchPostsByTag`, `fetchTrendingTags`, `getMockTagStat`, `MOCK_AUTHORS`, `MOCK_FOLLOWED_AUTHOR_IDS`, `usePostActions` (for `upsertPosts`).

### 4.4 Search feature (`src/features/search/`)

Types (`search/types/index.ts`)
```ts
export type SearchTab = "top" | "users" | "posts" | "tags";
export interface SearchResult { query: string; userIds: string[]; postIds: string[]; tags: HashtagStat[] }
export interface SearchSuggestions { users: UserProfile[]; tags: HashtagStat[] }
```

`services/search-service.ts`
```ts
export async function fetchSearch(query: string): Promise<{ users: UserProfile[]; posts: PostItem[]; tags: HashtagStat[] }>;
export async function fetchSuggestions(query: string): Promise<SearchSuggestions>; // <= 4 users, <= 4 tags
export function resolveDefaultTab(query: string): SearchTab;                       // "#" -> tags, "@" -> users, else top
```
- `tags` for a query = trending tags whose normalized tag contains the normalized query (leading `#` stripped)
- Parallel calls (`Promise.all`) to post/user services

`store/search-store.ts`
```ts
recent: string[]                       // persisted (key "ysocial_recent_searches"), max 10
result: SearchResult | null            // last search, keyed by normalized query (NOT persisted)
tagPages: Record<string, { tag; postsCount; postIds }>  // key `${normalizedTag}:${sort}`, NOT persisted
actions: addRecent(q), removeRecent(q), clearRecent(), setResult(r), setTagPage(key, page)
```
- `persist` with `partialize: recent` + `skipHydration: true`; `Providers` calls `useSearchStore.persist.rehydrate()` in its existing `useLayoutEffect`
- `addRecent`: trims, ignores empty, dedupes by `normalizeText`, newest first, slice 10

Components (`search/components/`)
| Component | Role |
|---|---|
| `search-box.tsx` | Combobox input. Props `defaultValue`, `autoFocus?`, `variant: "page" \| "sidebar"`. Empty + focused -> recent list (remove per item); typing -> `useDebouncedValue(q, 250)` -> `fetchSuggestions`, stale responses dropped via request counter. Keys: ↑↓ move `aria-activedescendant`, Enter = selected option or submit query, Esc closes. Submit -> `addRecent` + `router.push("/search?q=...")`. Option mousedown `preventDefault` (keeps focus). User option -> `/@username`, tag option -> `/tags/x` |
| `search-container.tsx` | Client. Props `query`, `tab?`. Empty query -> `ExploreLanding`. Else cache hit (`result.query` normalized equal) -> render at once; miss -> skeleton + `fetchSearch` -> `upsertPosts` / `upsertUsers` / `setResult`; error -> `EmptyState` + retry. Renders `SearchTabs` + active panel |
| `search-tabs.tsx` | Tab bar (same style as `PostFeed` tabs), `role="tablist"`, change -> `router.replace` with `tab` param |
| `search-panels.tsx` | `TopPanel` (<= 3 `UserResultRow` + "Xem tất cả" + posts), `UsersPanel`, `PostsPanel` (renders `latestPostIds` in the order returned by `search-service` (`searchPosts(q, limit, "latest")`); MUST NOT re-sort by `createdAt` on the client), `TagsPanel`; each with tab-specific `EmptyState` |
| `user-result-row.tsx` | Avatar, name (highlighted), @username, bio 1 line, followers count, `FollowButton`; row links to `/@username` |
| `tag-result-row.tsx` | `#tag` (highlighted) + "N bài viết", links to `/tags/x` |
| `explore-landing.tsx` | Recent searches (chips, remove, clear all; hidden when empty), trending tags (`fetchTrendingTags(6)`), suggested users (`fetchSuggestedUsers(5)`) |
| `tag-container.tsx` | Client. Props `tag`, `sort`. Header `#tag` + count, tabs Top / Mới nhất (`router.replace ?sort=`), list of `PostCard`; cache in `tagPages`; 0 posts -> `EmptyState` + CTA "Tìm kiếm khác" -> `/search` |
| `search-shell.tsx` | Page frame + sticky header slot, shared by route `loading.tsx` & containers -> no header jump (CLS, post-detail D16) |
| `search-skeleton.tsx` | User row & post card skeletons matching real sizes (reuse `PostSkeletonList`) |

- `PostCard` in results gets `highlightTokens = tokenize(query)` (NOT on tag page)
- Barrel `search/index.ts`: `SearchBox`, `SearchContainer`, `TagContainer`, `SearchShell`, `SearchSkeleton`

### 4.5 Routes

```
src/app/search/page.tsx      # searchParams: Promise<{ q?: string; tab?: string }>; metadata title: q ? `"${q}" - Tìm kiếm • YSocial` : "Khám phá • YSocial"; robots noindex when q
src/app/search/loading.tsx   # MainLayout + SearchShell (static input placeholder) + SearchSkeleton
src/app/search/error.tsx     # EmptyState + reset()
src/app/tags/[tag]/page.tsx  # generateMetadata from getMockTagStat; OG title "#tag • YSocial", description "N bài viết"
src/app/tags/[tag]/loading.tsx
src/app/tags/[tag]/error.tsx
```
- `page.tsx` validates `tab` (unknown -> `resolveDefaultTab(q)`) & `sort` (unknown -> `top`), passes as props; `<SearchContainer key={q}>` / `<TagContainer key={tag + sort}>`
- Pages read `searchParams` server-side -> NO `useSearchParams` (avoids Suspense / CSR bailout)

### 4.6 Layout wiring
- `RightSidebar`: `usePathname() === "/search"` -> skip `SearchWidget`
- `SearchWidget` -> thin wrapper `<SearchBox variant="sidebar" />` (imports `@/features/search`)
- `TrendingWidget`: `fetchTrendingTags(3)` on mount, rows link to `/tags/x`, "N bài viết"; skeleton while loading
- `FollowSuggestions`: see 4.2

## 5. UI / Design (Luxury Minimal, Zinc)

- Page header: sticky, `backdrop-blur`, `SearchBox variant="page"` (rounded-2xl, thin border, Search icon, clear `X` button with `aria-label`); tabs below, same underline style as feed tabs
- Dropdown: `absolute` panel, rounded-2xl, `border-zinc-200/60 dark:border-zinc-800/60`, shadow-lg, max-h 70vh scroll; sections "Gần đây" / "Người dùng" / "Hashtag"; active option `bg-zinc-100 dark:bg-zinc-900`
- Rows min-h 56px (touch >= 44px), hover `bg-zinc-50 dark:bg-zinc-950`
- Highlight: subtle zinc mark, NOT yellow
- Mobile (< lg): `/search` is the only search entry (sidebar hidden); input full width
- Animations: dropdown fade/scale 150ms (`tw-animate-css`, already installed), disabled with `motion-reduce`

## 6. i18n keys (vi & en)

- **Domain**: `search`, `tags`

## 7. Edge Cases

| Case | Behavior |
|---|---|
| `q` whitespace only | Treated as empty -> Explore landing |
| `q` = `#` or `@` only | Empty tokens -> empty result state, no service call |
| Diacritics / case | "da lat" matches "Đà Lạt"; "NEXTJS" matches "#NextJS" |
| Tag URL encoding | `/tags/%C4%90%C3%A0L%E1%BA%A1t` decoded via `decodeURIComponent` in page; invalid encoding -> `notFound()` |
| Stale suggestion response | Dropped (request counter) |
| Back from thread to search | Cached result renders instantly (no skeleton) |
| Follow in search -> sidebar | Same `user-store` entity -> synced |
| Like in search -> feed | Same `post-store` entity + persisted in service -> synced |
| Recent storage blocked | `persist` storage wrapped in try/catch -> in-memory only |
| Link inside post content | Navigates to tag/profile, thread NOT opened |

## 8. Testing (TDD, Vitest + RTL)

| File | Cases |
|---|---|
| `lib/text.test.ts` | strip diacritics & `đ`; tokenize collapses spaces; extractHashtags Vietnamese letters, dedupe, ignores `#` alone |
| `components/shared/highlight-text.test.tsx` | marks diacritics-insensitive matches with original text; no tokens -> plain text |
| `hooks/use-debounced-value.test.ts` | updates after delay only (fake timers) |
| `profile/services/user-service.test.ts` | token AND match over name/username/bio; `@` stripped; ordering; `setFollow` survives refetch; suggested excludes followed |
| `profile/store/user-store.test.ts` | toggleFollow ±1, floor 0, unknown id no-op |
| `posts/services/post-service.test.ts` (extend) | searchPosts roots only, AND tokens, diacritics, relevance order, created post found; `#` exact tag; fetchPostsByTag sort & casing & count; trending counts |
| `posts/utils/rich-content.test.tsx` | tag & mention become links with right href; click link -> parent handler not called; highlight applied to text only |
| `search/services/search-service.test.ts` | resolveDefaultTab; suggestions limits; tags filtered by query |
| `search/store/search-store.test.ts` | addRecent dedupe (normalized), max 10, remove, clear, ignores blank |
| `search/components/search-box.test.tsx` | recent shown on focus; debounce -> 1 call; stale response ignored; ↑↓ + Enter navigates; Esc closes; submit pushes route + adds recent |
| `search/components/search-container.test.tsx` | empty q -> landing; results per tab; empty state per tab; error -> retry; cache hit renders without service call |
| `search/components/tag-container.test.tsx` | header count; sort switch; empty tag -> EmptyState |
| `profile/components/follow-button.test.tsx` | toggles store + calls `setFollow` |

- Tests rendering async containers MUST await first fetch before ending (post-detail pitfall)
- Verification: `npm run test`, `npm run typecheck`, `npm run lint` (0 new errors); browser pass at 375/768/1440, light & dark, keyboard-only combobox

## 9. Out of Scope

- Real API, server-side search, fuzzy/typo tolerance, search in replies, paging / infinite scroll for results, Media tab, saved searches, F0.6 profile page on mocks (profile page still SSR-fetches BE)
