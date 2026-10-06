---
module: Search / Explore & Hashtag Page (FE, mock data)
updated: 2026-10-06
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
- `src/lib/text.ts` - `foldText` (NFD, strip marks, đ->d, lowercase), `normalizeText` (+ collapse spaces), `tokenize`, `extractHashtags`, `HASHTAG_PATTERN` (start or after whitespace, `\p{M}` for NFD input) / `MENTION_PATTERN` (trailing `.` excluded)
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
6. **Stale-while-revalidate everywhere**: result cache in `search-store` (last search + tag pages per key) renders at once on Back, refetch always runs & replaces it silently; refetch failure keeps cached view. Sidebar/explore widgets use `hooks/use-cached-resource.ts` (module cache, cleared in `vitest.setup.ts`) because each page renders its own `MainLayout` -> sidebar remounts on every navigation
7. **Tab order comes from the service ONLY**: `fetchSearch` calls `searchPosts(q, limit, "relevance")` & `searchPosts(q, limit, "latest")` in parallel; `latestPostIds` stored in service order, NEVER re-sorted on client (client re-sort of top-N relevance != newest overall once API is real)
8. **Tag matching ignores spaces in query** (`"da lat"` -> `#ĐàLạt`): tags never contain spaces
9. **Links in post content `stopPropagation`** -> content click opens thread, link click opens tag/profile
10. **`@mention` always linked** - posts feature must not import profile (profile mocks import posts barrel -> cycle)
11. **SearchBox ignores Enter while `nativeEvent.isComposing`** (Vietnamese IME confirms composition with Enter)
12. **Icon buttons < 44px get invisible `after:` hit area** (same trick as `FollowButton`)
13. **Recent searches `skipHydration`** + rehydrate after mount -> SSR & first client render match

## Testing
- `npm run test` 180 passed; `npm run typecheck` 0; `npx eslint src` = baseline (64 errors, 25 warnings, all pre-existing)
- Async container tests use real timers + `waitFor` / `findBy` (3s timeout) and await first fetch

## Pitfall log
| Symptom | Root cause | Fix | Verification |
|---|---|---|---|
| Every `SearchBox` test timed out (5s) | RTL `asyncWrapper` awaits a real `setTimeout(0)`; it only auto-advances Jest fake timers, Vitest fake timers never fire it | Real timers + `waitFor` in component tests using `userEvent`; fake timers ONLY for pure hook/service tests | Minimal repro passed with real timers; `search-box.test.tsx` 7/7, 3 repeated runs green |
| Query "da lat" showed no `#ĐàLạt` suggestion | Tag filter compared `"da lat"` (with space) to `"dalat"` | Strip spaces from query before tag match | `search-service.test.ts` "matches tags ignoring spaces in the query" RED -> GREEN |

## Review follow-up (2026-10-06)
| Item | Decision |
|---|---|
| `skipHydration` + rehydrate in `Providers` | KEEP: without it persist reads `localStorage` at store creation -> recent list differs from SSR -> hydration mismatch in `ExploreLanding`. Root rehydrate = documented `hydrateLocale` pattern; 1 call vs 3 consumers |
| Hashtag boundary | Already `(?<=^|\s)` (= `(?:^|(?<=\s))`); docs fixed + URL-fragment test |
| Client re-sort of Posts tab | Removed; see decision 7 |
| Former deferred minors | All fixed: stale suggestions shown only while text refines their query + request id bumped on empty input; NFD hashtags; mention trailing `.`; bare `#`/`@` -> empty-result state, never saved to recent; EN singular keys (`tags.postsCountOne`, `search.followersOne`); `FollowButton` toasts via `card.followSuccess`/`unfollowSuccess`; remove-recent X `aria-hidden` (mouse) + `Delete` key (keyboard), `aria-controls` only when listbox rendered, `TabBar` roving tabindex + ←/→/Home/End + tab/panel ids; unused keys removed; persisted `recent` validated in `merge`; tab/sort prop synced on same-query navigation |

## Known issues (out of scope)
- `PostCard` author Follow button keeps its own local state -> can disagree with `user-store` (`UserResultRow` shows Following, card shows Follow). Fix with 1.6 hover card / Phase 2 (needs follow state source posts can read without importing profile)
- Malformed tag URL (`/tags/%E0%A4`) gets Next.js 400 before the page runs; `decodeTagParam` -> `notFound()` remains as defense
- Desktop 1024px: horizontal scrollbar from fixed sidebar widths (pre-existing layout)
