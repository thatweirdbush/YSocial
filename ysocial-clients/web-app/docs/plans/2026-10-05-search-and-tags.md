# Search / Explore & Hashtag Page Implementation Plan

> **Agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`; execute task-by-task. Track steps via `- [x]`.

- **Goal:** ship `/search` (explore landing + Top / Người dùng / Bài viết / Hashtag results, combobox suggestions, recent searches) & `/tags/[tag]`, plus linkified `#tag` / `@mention` and mock-backed sidebar widgets.
- **Architecture:** `post-service` & new `user-service` (in-memory mocks) = ONLY data sources; `search-service` orchestrates them. Results upserted into `post-store` / new `user-store` (normalized) -> like/bookmark/follow synced everywhere. `search-store` holds persisted recent searches + last-result cache.
- **Tech stack:** Next.js 16 App Router, React 19, TypeScript strict, Zustand 5 (`persist`), Tailwind v4, shadcn/Radix, Lucide, Vitest 4 + RTL + jsdom.
- **Spec:** `docs/specs/2026-10-05-search-and-tags-design.md`
- All paths relative to `ysocial-clients/web-app/`.

## Global Constraints

- NO BE/API calls in new/touched flows; new files MUST NOT import `apiClient`.
- NO new deps (runtime or dev).
- Files `kebab-case`, components `PascalCase`, CRLF line endings, `import type` for type-only imports, sorted imports.
- Domain types ONLY in `features/<feature>/types/index.ts`; cross-feature imports ONLY via `@/features/<feature>` or `@/features/<feature>/types`.
- Pages = thin Server Components; metadata in `page.tsx`; read `searchParams`/`params` server-side (NO `useSearchParams`).
- All strings via `useTranslation()`, keys in both `vi.json` & `en.json`, NO `as any`. **i18n keys MUST be flat** (`search.tabTop`, not `search.tabs.top`): `TranslationKey` types only 1 nesting level. Add `search.*` & `tags.*` to the `TranslationKey` union in `src/hooks/use-translation.ts`.
- Touch targets >= 44px; icon-only buttons have `aria-label`; transitions 150-300ms + `motion-reduce:transition-none`.
- SSR-safe stores: NO `localStorage` read in initializer.
- Baseline (2026-10-05): `npm run test` 74 passed / 12 files; `npm run typecheck` exit 0; `npx eslint src` 64 errors, 25 warnings -> **NO new errors/warnings** in touched files.
- Tests rendering async containers MUST await the first fetch before ending (post-detail pitfall).
- Commit messages: Conventional Commits, author = user ONLY, **NO `Co-Authored-By` trailer**.

## Review Focus

1. **Regex-special chars in query** (`c++`, `(`, `[`, `.*`) -> no throw, literal match. Pinned: Task 1 (`HighlightText` "treats regex characters literally"), Task 2 (`searchPosts` "treats regex characters literally").
2. **Highlight maps back through diacritics** -> token `lat` highlights `Lạt` (original chars kept). Pinned: Task 1 (`highlight-text` "marks diacritics-insensitive matches with original text").
3. **Enter pressed before debounce settles** -> submits current input text, not debounced value; no stale suggestion overwrites. Pinned: Task 7 ("submits the typed text before the debounce settles").
4. **Back to `/search` after opening a thread** -> cached result renders with no skeleton & no service call. Pinned: Task 8 ("renders cached result without calling the service").
5. **Tag URL with Vietnamese chars or broken encoding** (`/tags/%C4%90%C3%A0L%E1%BA%A1t`, `/tags/%E0%A4`) -> decoded tag matches; broken -> `notFound()`. Pinned: Task 9 (`decodeTagParam` tests).

---

### Task 1: Text utils, debounce hook, HighlightText

**Files:**
- Create: `src/lib/text.ts`, `src/lib/text.test.ts`, `src/hooks/use-debounced-value.ts`, `src/hooks/use-debounced-value.test.ts`, `src/components/shared/highlight-text.tsx`, `src/components/shared/highlight-text.test.tsx`

**Interfaces:**
- Produces: `normalizeText(input: string): string`, `tokenize(input: string): string[]`, `extractHashtags(content: string): string[]`, `HASHTAG_PATTERN: RegExp` (`/#([\p{L}\p{N}_]+)/gu`), `MENTION_PATTERN: RegExp` (`/@([a-zA-Z0-9._]+)/g`), `useDebouncedValue<T>(value: T, delayMs: number): T`, `<HighlightText text: string tokens: string[] />`.

- [ ] **Step 1: Write failing tests**
  - `text.test.ts`: `normalizeText("  Đà   LẠT ")` -> `"da lat"`; `normalizeText("Phở")` -> `"pho"`; `tokenize(" Next  JS ")` -> `["next","js"]`; `tokenize("   ")` -> `[]`; `extractHashtags("Hi #ĐàLạt #NextJS #dalat #")` -> `["ĐàLạt","NextJS"]` (dedupe by normalized form, keep first casing, lone `#` ignored); `#` MUST be at start or after whitespace: `extractHashtags("a#b #c")` -> `["c"]`.
  - `use-debounced-value.test.ts` (fake timers, `renderHook`): initial value returned at once; rerender with new value -> old value until 250ms elapsed, then new.
  - `highlight-text.test.tsx`: `text="Bình minh ở Đà Lạt" tokens={["da","lat"]}` -> `<mark>` texts exactly `["Đà","Lạt"]`; `tokens={[]}` -> no `<mark>`, full text rendered; "treats regex characters literally": `text="I love c++ (really)" tokens={["c++","("]}` -> marks `["c++","("]`, no throw.
- [ ] **Step 2:** `npm run test -- text use-debounced highlight-text` -> FAIL (modules missing).
- [ ] **Step 3:** Implement. `normalizeText`: `.normalize("NFD").replace(/\p{M}/gu, "").replace(/[đĐ]/g, "d").toLowerCase().replace(/\s+/g, " ").trim()`. Hashtag pattern with lookbehind `(?<=^|\s)` (use same in `HASHTAG_PATTERN`). `HighlightText`: build per-char normalized string + index map (normalize each original char individually; skip chars that normalize to `""`), find token occurrences with `indexOf` (NO RegExp), merge overlapping ranges, render `<mark className="rounded-sm bg-zinc-200/70 text-inherit dark:bg-zinc-700/60">`.
- [ ] **Step 4:** Same command -> PASS.
- [ ] **Step 5:** Commit `feat(search): add text normalization, debounce hook & highlight`.

---

### Task 2: Seed hashtags & post-service search APIs

**Files:**
- Modify: `src/features/posts/types/index.ts`, `src/features/posts/mocks/mock-posts.ts`, `src/features/posts/mocks/mock-posts.test.ts`, `src/features/posts/services/post-service.ts`, `src/features/posts/services/post-service.test.ts`, `src/features/posts/index.ts`

**Interfaces:**
- Consumes: Task 1 `normalizeText`, `tokenize`, `extractHashtags`.
- Produces (types): `TagSort = "top" | "latest"`, `HashtagStat { tag: string; postsCount: number }`, `TagPage { tag: string; postsCount: number; posts: PostItem[] }`.
- Produces (service): `searchPosts(query: string, limit = 50): Promise<PostItem[]>`, `fetchPostsByTag(tag: string, sort: TagSort): Promise<TagPage>`, `fetchTrendingTags(limit: number): Promise<HashtagStat[]>`, `SEARCH_LIMIT = 50`.
- Produces (mocks): `getMockTagStat(tag: string): HashtagStat | undefined` (seed only, roots only).
- Produces (barrel): `searchPosts`, `fetchPostsByTag`, `fetchTrendingTags`, `getMockTagStat`, `MOCK_AUTHORS`, `MOCK_FOLLOWED_AUTHOR_IDS`, `usePostActions`, `usePost`.

- [ ] **Step 1: Seed** - append hashtags / mentions to root contents (ids, counts, order unchanged): post-001 `#YSocial #Minimalism`, post-002 `#NextJS`, post-003 `#Minimalism`, post-004 `#Design #Minimalism`, post-005 `cc @anquoc.dev #VietCode`, post-006 `#ĐàLạt`, post-007 `#Zustand #NextJS`, post-009 `#NextJS`, post-011 `#DarkMode #Design`, post-012 `#dalat` (casing variant of `ĐàLạt`). Resulting counts: `minimalism` 3, `nextjs` 3, `dalat` 2 (casing tie `ĐàLạt`/`dalat` -> first seen newest-first = `ĐàLạt`), `design` 2, others 1.
- [ ] **Step 2: Write failing tests**
  - `mock-posts.test.ts`: `getMockTagStat("nextjs")` -> `{ tag: "NextJS", postsCount: 3 }`; `getMockTagStat("DALAT")?.postsCount` -> `2`; `getMockTagStat("nope")` -> `undefined`.
  - `post-service.test.ts` `describe("search")`:
    - "matches every token, diacritics-insensitive": `searchPosts("binh minh da lat")` ids -> `["post-006"]`.
    - "excludes replies": `searchPosts("zinc")` contains no id with `parentId`.
    - "matches author name": `searchPosts("elena")` -> all `user.username === "elena_v"`.
    - "orders by relevance then likes": `searchPosts("nextjs")` ids -> `["post-009","post-002","post-007"]` (equal score 1, likes 45 > 42 > 12; `Next.js` text does NOT match token `nextjs`).
    - "boosts author-name matches": `searchPosts("antigravity")` first id `post-001`.
    - "finds a post created this session": `createPost({content:"Hello #Fresh"...})` -> `searchPosts("fresh")[0].id` equals created id.
    - "matches exact tag for # query": `searchPosts("#design")` ids set = `{post-004, post-011}`; `searchPosts("#des")` -> `[]`.
    - "treats regex characters literally": `searchPosts("c++ (")` resolves `[]`, no throw.
    - "returns [] for empty tokens": `searchPosts("#")` and `searchPosts("  ")` -> `[]`.
    - `fetchPostsByTag("DALAT","latest")` -> `tag "ĐàLạt"`, `postsCount 2`, ids `["post-006","post-012"]`.
    - `fetchPostsByTag("nextjs","latest")` ids `["post-002","post-007","post-009"]`; `"top"` ids `["post-009","post-002","post-007"]`.
    - unknown tag -> `{ tag: input, postsCount: 0, posts: [] }`.
    - `fetchTrendingTags(3)` -> `[{ tag: "Minimalism", postsCount: 3 }, { tag: "NextJS", postsCount: 3 }, { tag: "ĐàLạt", postsCount: 2 }]` (count desc, then normalized tag asc).
- [ ] **Step 3:** `npm run test -- post-service mock-posts` -> FAIL.
- [ ] **Step 4:** Implement per spec 4.3. Shared helper `tagKey = (tag) => normalizeText(tag.replace(/^#/, ""))`. Score: Σ `countOccurrences(normContent, token)` + 2 × tokens found in normalized `displayName + " " + username`. Sort score desc, likes desc, newest. Use `simulateNetwork()` for all 3. Most frequent casing: count per original form, tie -> first seen when iterating newest-first.
- [ ] **Step 5:** `npm run test` -> all PASS (existing 74 still green).
- [ ] **Step 6:** Commit `feat(posts): add hashtag seeds & search/tag/trending service APIs`.

---

### Task 3: RichContent & PostCard linkify

**Files:**
- Create: `src/features/posts/utils/rich-content.tsx`, `src/features/posts/utils/rich-content.test.tsx`
- Modify: `src/features/posts/components/post-card.tsx` (content block ~line 486), `src/features/posts/components/post-card.test.tsx`

**Interfaces:**
- Consumes: Task 1 `HASHTAG_PATTERN`, `MENTION_PATTERN`, `HighlightText`.
- Produces: `<RichContent content: string highlightTokens?: string[] />`; `PostCard` prop `highlightTokens?: string[]`.

- [ ] **Step 1: Write failing tests**
  - `rich-content.test.tsx`: `"Sáng nay #ĐàLạt cùng @anquoc.dev"` -> link `#ĐàLạt` href `/tags/%C4%90%C3%A0L%E1%BA%A1t`, link `@anquoc.dev` href `/@anquoc.dev`; click on link inside `<div onClick={spy}>` -> `spy` not called; `highlightTokens={["sang"]}` -> `<mark>` "Sáng"; highlight applies to text segments ONLY: `highlightTokens={["dalat"]}` -> tag link contains no `<mark>`.
  - `post-card.test.tsx`: "opens tag page, not thread, when clicking a hashtag" -> render post with `#Design`, click link -> `push` not called with `/posts/...`.
- [ ] **Step 2:** `npm run test -- rich-content post-card` -> FAIL.
- [ ] **Step 3:** Implement: combined split via `matchAll` over `HASHTAG_PATTERN` & `MENTION_PATTERN` sorted by index; `next/link` with `onClick={(e) => e.stopPropagation()}`, class `font-medium text-zinc-950 hover:underline dark:text-zinc-50`. Mention pattern also needs start-or-whitespace lookbehind (avoid emails). `PostCard` content: `<RichContent content={live.content} highlightTokens={highlightTokens} />`.
- [ ] **Step 4:** `npm run test` -> PASS.
- [ ] **Step 5:** Commit `feat(posts): linkify hashtags & mentions in post content`.

---

### Task 4: Users - mocks, service, store, FollowButton, FollowSuggestions

**Files:**
- Create: `src/features/profile/mocks/mock-users.ts`, `src/features/profile/services/user-service.ts`, `src/features/profile/services/user-service.test.ts`, `src/features/profile/store/user-store.ts`, `src/features/profile/store/user-store.test.ts`, `src/features/profile/components/follow-button.tsx`, `src/features/profile/components/follow-button.test.tsx`
- Modify: `src/features/profile/index.ts`, `src/components/layout/right-sidebar/follow-suggestions.tsx`

**Interfaces:**
- Consumes: Task 1 `normalizeText`, `tokenize`; Task 2 barrel `MOCK_AUTHORS`, `MOCK_FOLLOWED_AUTHOR_IDS`.
- Produces: `MOCK_USERS: UserProfile[]`; `searchUsers(query: string, limit = 50): Promise<UserProfile[]>`, `fetchSuggestedUsers(limit: number): Promise<UserProfile[]>`, `setFollow(id: string, following: boolean): Promise<void>`, `__resetMockUsers(): void`; `useUserStore`, `useUser(id: string): UserProfile | undefined`, `useUserActions(): { upsertUsers(users: UserProfile[]): void; toggleFollow(id: string): void }`, `resetUserStore(): void`; `<FollowButton userId: string className?: string />`.

- [ ] **Step 1: Write failing tests**
  - `user-store.test.ts`: `toggleFollow` flips `isFollowing` & `followersCount` ±1; floor 0 when unfollowing at 0; unknown id -> state reference unchanged.
  - `user-service.test.ts` (`beforeEach(__resetMockUsers)`, fake or real timers like `post-service.test.ts`): `searchUsers("tran quoc")` -> `["anquoc.dev"]`; `searchUsers("@anquoc")` same; bio match (pick a bio word from seed); username-prefix ranks first; `searchUsers("")` -> `[]`; `fetchSuggestedUsers(3)` -> none `isFollowing`, sorted `followersCount` desc, length 3; "persists follow so a refetch keeps it": `setFollow(id,true)` -> `fetchSuggestedUsers(8)` excludes id & `searchUsers(username)[0].followersCount` = seed + 1; `setFollow` twice same value -> count +1 once.
  - `follow-button.test.tsx`: seeded unfollowed user -> button "Theo dõi" `aria-pressed=false`; click -> store `isFollowing` true, label changes, `setFollow` called with `(id, true)` (spy via `vi.mock("../services/user-service")`).
- [ ] **Step 2:** `npm run test -- user-store user-service follow-button` -> FAIL.
- [ ] **Step 3:** Implement per spec 4.2. Mock users: map `MOCK_AUTHORS` + `Record<authorId, { bio; followersCount; followingCount }>` (Vietnamese bios, realistic counts 120-48_000). Store mirrors `post-store` style (`actions` object, frozen selectors). FollowButton: visual + toasts from current `FollowSuggestionItem` (`card.follow` / `card.following` keys), `aria-pressed`, min-h 44px hit area via padding wrapper.
- [ ] **Step 4:** Migrate `FollowSuggestions`: `useEffect` -> `fetchSuggestedUsers(3)` -> `upsertUsers` -> local `ids` state; rows `useUser(id)` + `FollowButton`; 3 skeleton rows (`Skeleton` avatar 40px + 2 lines) while loading; remove inline `MockUser`. Guard against setState after unmount (`let active = true`).
- [ ] **Step 5:** `npm run test` -> PASS; `npm run typecheck` -> 0.
- [ ] **Step 6:** Commit `feat(profile): add mock user service, user store & shared follow button`.

---

### Task 5: Search types, service, store & persist hydration

**Files:**
- Create: `src/features/search/types/index.ts`, `src/features/search/services/search-service.ts`, `src/features/search/services/search-service.test.ts`, `src/features/search/store/search-store.ts`, `src/features/search/store/search-store.test.ts`, `src/features/search/index.ts`
- Modify: `src/app/providers.tsx`

**Interfaces:**
- Consumes: Task 2 `searchPosts`, `fetchTrendingTags`, `HashtagStat`; Task 4 `searchUsers`; Task 1 `normalizeText`.
- Produces (types): `SearchTab = "top" | "users" | "posts" | "tags"`, `SEARCH_TABS: readonly SearchTab[]`, `SearchResult { query: string; userIds: string[]; postIds: string[]; tags: HashtagStat[] }`, `SearchSuggestions { users: UserProfile[]; tags: HashtagStat[] }`, `TagPageCache { tag: string; postsCount: number; postIds: string[] }`.
- Produces (service): `fetchSearch(query: string): Promise<{ users: UserProfile[]; posts: PostItem[]; tags: HashtagStat[] }>`, `fetchSuggestions(query: string): Promise<SearchSuggestions>`, `resolveDefaultTab(query: string): SearchTab`, `isSearchTab(value: unknown): value is SearchTab`, `SUGGESTION_LIMIT = 4`.
- Produces (store): `useSearchStore` (persist name `"ysocial_recent_searches"`, `partialize: recent`, `skipHydration: true`), `useRecentSearches(): string[]`, `useSearchResult(): SearchResult | null`, `useTagPage(key: string): TagPageCache | undefined`, `useSearchActions(): { addRecent(q: string): void; removeRecent(q: string): void; clearRecent(): void; setResult(r: SearchResult): void; setTagPage(key: string, page: TagPageCache): void }`, `tagPageKey(tag: string, sort: TagSort): string`, `RECENT_LIMIT = 10`, `resetSearchStore(): void`.

- [ ] **Step 1: Write failing tests**
  - `search-service.test.ts`: `resolveDefaultTab("#x")` -> `"tags"`, `"@x"` -> `"users"`, `"x"` -> `"top"`; `isSearchTab("posts")` true, `"foo"` false; `fetchSuggestions("n")` -> `users.length <= 4 && tags.length <= 4`; `fetchSearch("#design")` -> `tags` every normalized tag contains `"design"`; `fetchSearch("  ")` -> all empty arrays, no service call (spy).
  - `search-store.test.ts`: `addRecent(" Đà Lạt ")` then `addRecent("da lat")` -> `recent` = `["da lat"]` (normalized dedupe, newest text wins, at top); 12 adds -> length 10, newest first; blank ignored; `removeRecent` by normalized match; `clearRecent` -> `[]`; persisted JSON in `localStorage["ysocial_recent_searches"]` contains `recent` only (no `result`).
- [ ] **Step 2:** `npm run test -- search-service search-store` -> FAIL.
- [ ] **Step 3:** Implement per spec 4.4. `fetchSearch`: `Promise.all([searchUsers, searchPosts, fetchTrendingTags(SEARCH_LIMIT)])`, filter tags by normalized containment of query stripped of leading `#`/`@`. Storage: `createJSONStorage(() => localStorage)` wrapped so `getItem/setItem` swallow errors.
- [ ] **Step 4:** `providers.tsx` existing `useLayoutEffect`: add `void useSearchStore.persist.rehydrate();` (import from `@/features/search`).
- [ ] **Step 5:** `npm run test` -> PASS.
- [ ] **Step 6:** Commit `feat(search): add search service & recent-search store`.

---

### Task 6: i18n keys

**Files:**
- Modify: `src/lib/locales/vi.json`, `src/lib/locales/en.json`, `src/hooks/use-translation.ts`

**Interfaces:**
- Produces flat keys (vi / en):
  - `search`: `placeholder` (Tìm kiếm người dùng, bài viết, #hashtag / Search people, posts, #hashtags), `clear` (Xóa / Clear), `recent` (Gần đây / Recent), `clearAll` (Xóa tất cả / Clear all), `removeRecent` (Xóa "{query}" / Remove "{query}"), `tabTop` (Hàng đầu / Top), `tabUsers` (Người dùng / People), `tabPosts` (Bài viết / Posts), `tabTags` (Hashtag / Hashtags), `seeAllUsers` (Xem tất cả / See all), `users` (Người dùng / People), `hashtags` (Hashtag / Hashtags), `trending` (Đang thịnh hành / Trending), `suggested` (Gợi ý cho bạn / Suggested for you), `exploreTitle` (Khám phá / Explore), `postsCount` ({count} bài viết / {count} posts), `followers` ({count} người theo dõi / {count} followers), `emptyTitle` (Không có kết quả cho "{query}" / No results for "{query}"), `emptyUsers` (Chưa thấy ai khớp, thử tên khác xem / Nobody matches yet, try another name), `emptyPosts` (Chưa có bài nào nói về chuyện này / Nobody has posted about this yet), `emptyTags` (Hashtag này còn trống trơn / No hashtags match), `error` (Tìm kiếm bị lỗi rồi / Search failed), `retry` (Thử lại / Retry), `searchFor` (Tìm "{query}" / Search for "{query}")
  - `tags`: `top` (Hàng đầu / Top), `latest` (Mới nhất / Latest), `postsCount` ({count} bài viết / {count} posts), `emptyTitle` (#{tag} chưa có bài nào / No posts in #{tag} yet), `emptyDescription` (Hãy là người đầu tiên khai phá / Be the first to post), `emptyCta` (Tìm kiếm khác / Search something else), `error` (Không tải được hashtag / Couldn't load hashtag)
- [ ] **Step 1:** Add keys to both files; extend `TranslationKey` with `` `search.${keyof typeof vi.search}` `` & `` `tags.${keyof typeof vi.tags}` ``.
- [ ] **Step 2:** `npm run typecheck` -> 0; `npm run test` -> PASS.
- [ ] **Step 3:** Commit `feat(i18n): add search & tags translations`.

*(Spec section 6 nested key names map to these flat keys.)*

---

### Task 7: SearchBox combobox & sidebar wiring

**Files:**
- Create: `src/features/search/components/search-box.tsx`, `src/features/search/components/search-box.test.tsx`
- Modify: `src/features/search/index.ts`, `src/components/layout/right-sidebar/search-widget.tsx`, `src/components/layout/right-sidebar/index.tsx`

**Interfaces:**
- Consumes: Task 5 `fetchSuggestions`, `useRecentSearches`, `useSearchActions`; Task 1 `useDebouncedValue`, `HighlightText`, `tokenize`; Task 6 keys.
- Produces: `<SearchBox defaultValue?: string autoFocus?: boolean variant: "page" | "sidebar" />`; `SUGGEST_DEBOUNCE_MS = 250`; helper `buildSearchHref(query: string, tab?: SearchTab): string` (in `search-service.ts`, `/search?q=<encoded>[&tab=]`).

- [ ] **Step 1: Write failing tests** (`vi.mock("next/navigation")` push spy; `vi.mock` `fetchSuggestions`; fake timers via `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`)
  - "shows recent searches on focus when empty": seed `recent=["zinc"]` -> focus -> `role="option"` "zinc"; remove button `aria-label` `Xóa "zinc"` removes it.
  - "debounces suggestions": type `"nex"` -> `fetchSuggestions` called once with `"nex"` after 250ms.
  - "ignores a stale response": first call resolves after second -> options show second result only.
  - "navigates options with arrows and Enter": ArrowDown ×2 + Enter on tag option -> `push("/tags/NextJS")`; `aria-activedescendant` updates.
  - "submits the typed text before the debounce settles": type `"da lat"` + Enter immediately -> `push("/search?q=da%20lat")`, `recent[0] === "da lat"`.
  - "closes on Escape": Escape -> listbox gone, input keeps value.
  - first option in suggestions = `searchFor` row -> submits query.
- [ ] **Step 2:** `npm run test -- search-box` -> FAIL.
- [ ] **Step 3:** Implement per spec 4.4/5: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, listbox `role="listbox"`, options `id` stable; request counter ref for stale drop; options `onMouseDown={e => e.preventDefault()}`; close on blur; clear button (`search.clear`). Options order: `searchFor` row, users (avatar + highlighted name), tags (`#tag` + `tags.postsCount`). Dropdown `animate-in fade-in-0 zoom-in-95 duration-150 motion-reduce:animate-none`.
- [ ] **Step 4:** `SearchWidget` -> `<SearchBox variant="sidebar" />`; `RightSidebar` skips widget when `usePathname() === "/search"`.
- [ ] **Step 5:** `npm run test` -> PASS.
- [ ] **Step 6:** Commit `feat(search): add search combobox with suggestions & recent searches`.

---

### Task 8: Search page - container, tabs, panels, explore, route

**Files:**
- Create: `src/features/search/components/search-shell.tsx`, `search-skeleton.tsx`, `search-tabs.tsx`, `search-panels.tsx`, `user-result-row.tsx`, `tag-result-row.tsx`, `explore-landing.tsx`, `search-container.tsx`, `search-container.test.tsx` (all under `src/features/search/components/`); `src/app/search/page.tsx`, `src/app/search/loading.tsx`, `src/app/search/error.tsx`
- Modify: `src/features/search/index.ts`

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6, 7 (`PostCard` with `highlightTokens`, `FollowButton`, `useUser`, `usePostActions().upsertPosts`, `useUserActions().upsertUsers`, `fetchSearch`, `useSearchResult`, `setResult`, `addRecent`, `buildSearchHref`, `resolveDefaultTab`, `isSearchTab`, `fetchTrendingTags`, `fetchSuggestedUsers`, `useRecentSearches`).
- Produces: `<SearchShell header: ReactNode children />`, `<SearchSkeleton />`, `<SearchContainer query: string tab: SearchTab />`, `<SearchTabs query tab />`, `<UserResultRow userId tokens />`, `<TagResultRow stat: HashtagStat tokens />`, `<ExploreLanding />`.

- [ ] **Step 1: Write failing tests** `search-container.test.tsx` (mock `next/navigation` with `push`/`replace` spies; real services with `__resetMockDb`/`__resetMockUsers`, reset stores):
  - "shows explore landing for an empty query": `query=""` -> heading `search.exploreTitle`, trending row `#Minimalism` after load.
  - "renders top results": `query="nextjs"` tab `top` -> skeleton, then <= 3 user rows + post cards with `<mark>`.
  - "switches tab via router.replace": click tab Người dùng -> `replace("/search?q=nextjs&tab=users")`.
  - "shows tab empty state": `query="zzzz"` tab `users` -> text `search.emptyUsers`.
  - "retries after a failure": mock `fetchSearch` reject once -> `search.error` + retry button -> click -> results.
  - "renders cached result without calling the service": `setResult` for `"nextjs"` + upsert entities -> render -> no skeleton, `fetchSearch` spy not called.
  - "adds the query to recent searches" after successful load.
- [ ] **Step 2:** `npm run test -- search-container` -> FAIL.
- [ ] **Step 3:** Implement components per spec 4.4/5 (`SearchShell` mirrors `PostDetailShell`: sticky `backdrop-blur` header slot with `SearchBox variant="page"` + `SearchTabs`; tabs underline style copied from `PostFeed`; `PostsPanel` sorts cached ids by `createdAt` desc via `usePostStore` getState at render memo; `TopPanel` link `search.seeAllUsers` -> tab users). Fetch effect guarded by ref (post-detail D7/D12); `active` flag for unmount.
- [ ] **Step 4:** Routes: `page.tsx` - `searchParams: Promise<{ q?: string | string[]; tab?: string | string[] }>`, take first value, trim; `tab = isSearchTab(raw) ? raw : resolveDefaultTab(q)`; `generateMetadata` per spec 4.5 (`robots: { index: false }` when q); render `<MainLayout><SearchContainer key={q} query={q} tab={tab} /></MainLayout>`. `loading.tsx` = `MainLayout` + `SearchShell` (static input placeholder) + `SearchSkeleton`. `error.tsx` mirrors `posts/[id]/error.tsx`.
- [ ] **Step 5:** `npm run test` -> PASS; `npm run typecheck` -> 0.
- [ ] **Step 6:** Commit `feat(search): add search & explore page`.

---

### Task 9: Tag page & TrendingWidget

**Files:**
- Create: `src/features/search/components/tag-container.tsx`, `tag-container.test.tsx`, `src/features/search/utils/decode-tag-param.ts`, `decode-tag-param.test.ts` (under `src/features/search/`); `src/app/tags/[tag]/page.tsx`, `loading.tsx`, `error.tsx`
- Modify: `src/features/search/index.ts`, `src/components/layout/right-sidebar/trending-widget.tsx`

**Interfaces:**
- Consumes: Task 2 `fetchPostsByTag`, `getMockTagStat`, `fetchTrendingTags`, `TagSort`; Task 5 `useTagPage`, `setTagPage`, `tagPageKey`; Task 8 `SearchShell`, `SearchSkeleton`.
- Produces: `<TagContainer tag: string sort: TagSort />`, `decodeTagParam(raw: string): string | null`, `isTagSort(value: unknown): value is TagSort`.

- [ ] **Step 1: Write failing tests**
  - `decode-tag-param.test.ts`: `"%C4%90%C3%A0L%E1%BA%A1t"` -> `"ĐàLạt"`; `"%23NextJS"` -> `"NextJS"` (strip leading `#`); `"%E0%A4"` -> `null`; `""` -> `null`.
  - `tag-container.test.tsx`: `tag="dalat" sort="latest"` -> header `#ĐàLạt`, `tags.postsCount` "2 bài viết", 2 cards newest first; click Hàng đầu -> `replace("/tags/dalat?sort=top")`; `tag="nope"` -> `EmptyState` with `tags.emptyTitle` + CTA link `/search`; cached page renders without service call.
- [ ] **Step 2:** `npm run test -- decode-tag-param tag-container` -> FAIL.
- [ ] **Step 3:** Implement `TagContainer` (header `#tag` text-2xl bold + count, tab bar shared visual with `SearchTabs`, `PostCard` list, NO `highlightTokens`). Route `page.tsx`: `decodeTagParam` null -> `notFound()`; `sort = isTagSort(raw) ? raw : "top"`; `generateMetadata` from `getMockTagStat` (title `#${stat?.tag ?? tag} • YSocial`, description `tags.postsCount` vi text, OG type `website`); `<TagContainer key={`${tag}:${sort}`} />`. `loading.tsx` / `error.tsx` like Task 8.
- [ ] **Step 4:** `TrendingWidget`: `fetchTrendingTags(3)` on mount (`active` guard), rows `Link` to `/tags/<encoded>`, subtitle `tags.postsCount`, 3 skeleton rows while loading; remove hard-coded "Home • Trending" & `mockTrends`.
- [ ] **Step 5:** `npm run test` -> PASS; `npm run typecheck` -> 0; `npx eslint src` -> no new problems vs baseline.
- [ ] **Step 6:** Commit `feat(search): add hashtag page & live trending widget`.

---

### Task 10: Browser verification & docs

**Files:**
- Modify: `.context/features/frontend-roadmap.md`, `.context/INDEX.md`
- Create: `.context/features/search.md` (as-built, format of `post-detail.md`)

- [ ] **Step 1:** `preview_start web-app` -> verify: nav Search -> explore landing; type "da lat" -> suggestions + Enter -> results with highlight; tabs switch & URL updates; click `#NextJS` in feed -> tag page, thread NOT opened; follow in search -> sidebar suggestion synced; like in results -> back to `/` synced; open thread from results -> Back -> instant results; recent survives reload; `/tags/%E0%A4` -> not-found; 375 / 768 / 1440, light & dark; keyboard-only combobox; console has no new errors/hydration warnings.
- [ ] **Step 2:** Fix issues found (TDD for logic bugs), re-run `npm run test`, `npm run typecheck`, `npx eslint src`.
- [ ] **Step 3:** Docs: roadmap mark 1.2 & 1.3 `[x]`, F0.2 users done; `search.md` (data flow, UI, design decisions, pitfalls); INDEX entry.
- [ ] **Step 4:** Commit `docs(context): document search & hashtag page`.
