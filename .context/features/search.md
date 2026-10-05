---
module: Search / Explore & Hashtag Page (FE, mock data)
updated: 2026-10-05
spec: ysocial-clients/web-app/docs/specs/2026-10-05-search-and-tags-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-05-search-and-tags.md
---

# Search / Explore & Hashtag Page

`/search` (explore landing + Top / Người dùng / Bài viết / Hashtag results, combobox suggestions, recent searches) & `/tags/[tag]` (Top / Mới nhất). `#tag` / `@username` in post content are links. NEVER calls BE.

## Data flow
```
SearchContainer / TagContainer / ExploreLanding / SearchBox / sidebar widgets
  -> search-service (orchestration only) -> post-service.searchPosts / fetchPostsByTag / fetchTrendingTags
                                         -> user-service.searchUsers / fetchSuggestedUsers
  -> upsertPosts (post-store) + upsertUsers (user-store) + setResult / setTagPage (search-store)
PostCard / UserResultRow / FollowButton <- usePost(id) / useUser(id)
```
- `src/lib/text.ts` - `foldText` (NFD, strip marks, đ->d, lowercase), `normalizeText` (+ collapse spaces), `tokenize`, `extractHashtags`, `HASHTAG_PATTERN` / `MENTION_PATTERN` (start or after whitespace)
- `posts/utils/hashtags.ts` - `tagKey`, `collectTagStats` (display casing = most frequent form, tie -> newest-first first seen), `hasTag`, `byNewest` (barrel: `byNewestPost`)
- `posts/services/post-service.ts` - `searchPosts(q)` roots only, every token required, score = content occurrences + 2 × author-name hits, order score -> likes -> newest; `#x` query = exact tag. `fetchPostsByTag(tag, sort)`, `fetchTrendingTags(n)` (count desc, key asc). `SEARCH_LIMIT = 50`. `getMockTagStat` (seed, sync) for metadata
- `profile/mocks/mock-users.ts` - `MOCK_USERS` = `MOCK_AUTHORS` + bio/counts; `isFollowing` from `MOCK_FOLLOWED_AUTHOR_IDS`
- `profile/services/user-service.ts` - `searchUsers` (name/username/bio, username-prefix first, then followers), `fetchSuggestedUsers` (not followed), `setFollow` (idempotent, persisted before latency). **Swap point for real API**
- `profile/store/user-store.ts` - `users: Record<id, UserProfile>`, `upsertUsers`, `toggleFollow` (±followersCount, floor 0)
- `search/services/search-service.ts` - `fetchSearch`, `fetchSuggestions` (<= 4 users / tags), `resolveDefaultTab` (`#` -> tags, `@` -> users), `isSearchTab`, `buildSearchHref`
- `search/store/search-store.ts` - `recent` (persist key `ysocial_recent_searches`, `partialize`, `skipHydration`, max 10, normalized dedupe), `result` (last search, ids + `latestPostIds`), `tagPages[tagPageKey(tag, sort)]`; rehydrated in `Providers` `useLayoutEffect`

## UI
- Routes: `app/search/{page,loading,error}.tsx` (page reads `searchParams` server-side, `key={query}`, `robots noindex` when q), `app/tags/[tag]/{page,loading,error}.tsx` (`decodeTagParam` null -> `notFound()`, `key={tag}`)
- `search/components/`: `SearchBox` (ARIA combobox, debounce 250ms, request counter drops stale responses, ↑↓ Enter Esc, option `mousedown` keeps focus), `SearchContainer`, `SearchPanel` (per-tab empty states), `UserResultRow`, `TagResultRow`, `ExploreLanding`, `TagContainer`, `TabBar` (shared), `SearchShell` + `SearchBoxPlaceholder` (shared by `loading.tsx`), `SearchSkeleton`
- `profile/components/follow-button.tsx` - `FollowButton userId` (store + `setFollow`, `aria-pressed`, 44px hit area via `after:`)
- `posts/utils/rich-content.tsx` - `RichContent` links + highlight in text segments only; `PostCard highlightTokens`
- `components/shared/highlight-text.tsx` - `HighlightText` diacritics-insensitive `<mark>` via per-char fold spans, `indexOf` only (regex chars literal)
- Sidebar: `SearchWidget` = `SearchBox variant="sidebar"` (hidden on `/search`), `TrendingWidget` & `FollowSuggestions` from services with skeletons
- i18n keys flat: `search.*`, `tags.*` (`TranslationKey` types 1 nesting level only)

## Design decisions (NEVER revert without reason)
1. **Search runs in services over the in-memory DB**, not over store cache -> unloaded & session-created posts found, persisted likes kept
2. **User data lives in `features/profile`** (not a new `users` feature) - profile already owns `UserProfile`
3. **Follow persisted in service** (`setFollow`), same lesson as likes: store-only toggles get clobbered on refetch
4. **Page passes `query`/`tab` as props from `searchParams`** -> NO `useSearchParams` (Suspense / CSR bailout)
5. **Tab / sort = local state + `router.replace(..., { scroll: false })`**; containers keyed by query / tag only -> instant switch, no remount flash
6. **Result cache in `search-store`** (last search + tag pages per key) -> Back from thread renders instantly. Skip-fetch decided once on mount (search) or via `getState()` in effect (tag)
7. **`latestPostIds` computed at fetch time** -> pure render, no `getState()` in render
8. **Tag matching ignores spaces in query** (`"da lat"` -> `#ĐàLạt`): tags never contain spaces
9. **Links in post content `stopPropagation`** -> content click opens thread, link click opens tag/profile
10. **`@mention` always linked** - posts feature must not import profile (profile mocks import posts barrel -> cycle)
11. **Recent searches `skipHydration`** + rehydrate after mount -> SSR & first client render match

## Testing
- `npm run test` 151 passed; `npm run typecheck` 0; `npx eslint src` = baseline (64 errors, 25 warnings, all pre-existing)
- Async container tests use real timers + `waitFor` / `findBy` (3s timeout) and await first fetch

## Pitfall log
| Symptom | Root cause | Fix | Verification |
|---|---|---|---|
| Every `SearchBox` test timed out (5s) | RTL `asyncWrapper` awaits a real `setTimeout(0)`; it only auto-advances Jest fake timers, Vitest fake timers never fire it | Real timers + `waitFor` in component tests using `userEvent`; fake timers ONLY for pure hook/service tests | Minimal repro passed with real timers; `search-box.test.tsx` 7/7, 3 repeated runs green |
| Query "da lat" showed no `#ĐàLạt` suggestion | Tag filter compared `"da lat"` (with space) to `"dalat"` | Strip spaces from query before tag match | `search-service.test.ts` "matches tags ignoring spaces in the query" RED -> GREEN |

## Known issues (out of scope)
- `PostCard` author Follow button keeps its own local state -> can disagree with `user-store` (`UserResultRow` shows Following, card shows Follow). Fix with 1.6 hover card / Phase 2 (needs follow state source posts can read without importing profile)
- Malformed tag URL (`/tags/%E0%A4`) gets Next.js 400 before the page runs; `decodeTagParam` -> `notFound()` remains as defense
- Desktop 1024px: horizontal scrollbar from fixed sidebar widths (pre-existing layout)
