---
module: Post Detail & Reply Thread (FE, mock data)
updated: 2026-10-05
spec: ysocial-clients/web-app/docs/specs/2026-10-01-post-detail-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-01-post-detail.md
---

# Post Detail & Reply Thread

`/posts/[id]` thread page (root post + 1-level replies + inline reply composer), backed by mock service + normalized Zustand post store shared with feed. NEVER calls BE in this flow.

## Data flow
```
container -> post-service (async mock, 300-600ms) -> upsertPosts / setFeedPage / setReplies -> post-store
PostCard / PostFeed / ReplyList <- usePost(id) / useFeedIds(tab) / useReplyIds(id)
```
- `features/posts/services/post-service.ts` - `fetchFeed(tab, page)`, `fetchPostThread(id)` (`{ post, parent?, replies, childReplies }`), `createPost`, `createReply`, `setPostLike(id, liked)`, `setPostBookmark(id, bookmarked)`. In-memory DB cloned from mocks; `__resetMockDb()` for tests; `MOCK_FAILURE_RATE` dev flag. **Swap point for real API**
- `features/posts/store/post-store.ts` - `posts: Record<id, PostItem>`, `replyIds: Record<parentId, id[]>`, `feedIds: Record<FeedTab, id[]>`; actions `upsertPosts`, `setFeedPage`, `setReplies`, `toggleLike(id, seed?)`, `toggleBookmark(id, seed?)`, `addReply`, `removeReply`, `prependPost`
- `features/posts/mocks/` - 8 authors (3 followed), 12 roots `post-001...012`, replies `reply-<root>-<nn>[-<mm>]`; `commentsCount` derived from reply count; timestamps offset from module load time. `getMockPostById` for server metadata
- `features/posts/hooks/use-current-author.ts` - `AuthUser` -> `PostAuthor` (guest fallback)

## UI
- Route `app/posts/[id]/`: `page.tsx` (server, `generateMetadata`, `<PostDetailContainer key={id}>`), `loading.tsx` (`PostDetailShell` + skeleton), `not-found.tsx` (client, i18n), `error.tsx`
- `components/detail/`: `PostDetailShell` (page frame + sticky header, shared by route loading & container), container (loading -> skeleton, null -> `notFound()`, error -> `EmptyState` + retry), header (Back: `router.back()`, or `/` without history), `PostCard variant="detail"`, `ReplyComposer`, `ReplyList` / `ReplyItem` (<= 2 inline children, "Xem thêm N câu trả lời" -> `/posts/[replyId]`), skeleton
- `PostCard`: `variant: "feed" | "detail" | "compact"`, `replyToUsername`; reads `usePost(id) ?? post`; `aria-label`s `card.like/comment/bookmark/share/more`; `post.isPending` -> `inert` + `aria-busy` + `opacity-60`; content click skipped while text selection active
- `PostCreatorCore`: `mode="reply"` hides audience & drafts pickers, submit label `postDetail.reply` / `postDetail.replying`; `placeholder` prop
- `PostFeed`: header button `feed.refresh`; next-page failure pauses infinite scroll -> inline retry button in sentinel slot
- `components/shared/empty-state.tsx` shared `EmptyState`
- i18n keys: `postDetail.*`, `card.like|comment|bookmark|share|more`, `feed.refresh`

## Design decisions (NEVER revert without reason)
1. **Mock service + normalized Zustand** (not TanStack cache) -> like/bookmark/reply synced across feed/detail/profile/saved in O(1); ONLY service bodies change when API wired
2. **Likes/bookmarks persisted in service** (`setPostLike`/`setPostBookmark`, applied before latency). Store-only toggles got clobbered when remounted feed/thread refetched & `upsertPosts` overwrote entity
3. **`toggleLike(id, seed)`** - Saved page items may not be cached; seed inserted before toggle
4. **ONLY content text + comment button navigate** to thread, not whole `<article>`: lightbox Dialog portal = React child of card -> article-level clicks would fire from inside lightbox
5. **`ReplyComposer` rethrows on failure** after rolling back temp reply - `PostCreatorCore` resets ONLY on success -> typed text survives for retry
6. **Stable empty selector** (`EMPTY_IDS` frozen constant) - returning `[]` inline from Zustand selector -> infinite re-renders
7. **`PostFeed` first-page fetch guarded by `requestedTabsRef`**; `loadPage` independent of `t` (recreated every render) -> no duplicate service calls
8. 1-level nesting ONLY; deeper replies open as own thread (Threads-style)
9. **Feed paging meta (`feedMeta: {loaded, nextPage}`) lives in store**, not `PostFeed` state -> Back from thread renders cached pages instantly (no skeleton, no refetch), matching old TanStack 5-min cache. `setFeedPage(append)` dedupes ids since offset pages shift after `prependPost`
10. **Saved mock items ref shared post mocks** (`getMockPostById`) -> every card opens real thread; bookmarked mocks: post-002/006/010
11. **Reply composer Escape**: collapses ONLY when empty (focus returns to bar); with text stays open - shared `DiscardWarningDialog` would save replies into post drafts
12. Feed first-load guard MUST stay a **ref** (`cachedFeedTabs()` snapshot): `react-hooks/set-state-in-effect` flags async setState behind useState/getState guard
13. **`PostItem.isPending`** (client-only optimistic flag) -> card `inert`: blocks click/focus/like on temp reply without per-handler guards; server copy never carries it
14. **Infinite scroll paused while tab `failed`** (state guard in observer effect); resume ONLY via inline retry or a successful refresh. Ref-lock considered & rejected (YAGNI: flaky double-call was test pollution, not a prod race)
15. **Text-selection guard**: `openThread` returns while `getSelection().isCollapsed === false` (drag/double-click select). First click of a double-click still navigates (same as Threads/X)
16. **`PostDetailShell` shared** by route `loading.tsx` & container -> header renders identically in both, no 56px jump (CLS)

## Testing
- Vitest 4.1 + RTL + jsdom (`npm run test`, `npm run typecheck`)
- `vitest.setup.ts` pins locale `vi`, stubs `IntersectionObserver` + `ResizeObserver`
- Vite 8 Oxc handles TSX (`oxc.jsx.runtime: "automatic"`); `@vitejs/plugin-react` dropped (Babel 8 peer conflict with shadcn); vitest 5 skipped (needs `@types/node` >= 22)

## Pitfall log
| Symptom | Root cause | Fix | Verification |
|---|---|---|---|
| Like on thread -> Back -> feed count reverted | `PostFeed` remount refetched from service (never saw like); `upsertPosts` overwrote store entity | Service persists like/bookmark; `PostCard` calls `setPostLike`/`setPostBookmark` after store toggle | `post-service.test.ts` "persists likes so a refetch keeps them", "applies a like before a fetch that was already in flight resolves"; `post-card.test.tsx` "persists the like to the service..." |
| Session-created posts sorted below seeds | Fixed `MOCK_BASE_DATE` ahead of real clock | Base = module load time | `post-service.test.ts` "puts a created post first in the feed" |
| Feed page-2 failure -> endless refetch + stacked toasts | Observer effect re-ran on every render (`loadWithFeedback` identity follows `t`) & on `isFetchingNext` flip; new observer fires at once while sentinel visible -> refetch failed page | Observer effect skips while `failed`; inline retry button | `post-feed.test.tsx` "stops auto-loading after a next-page failure..." (`AlwaysVisibleObserver` stub; 82 calls -> 1) |
| Flaky feed test: page 2 called twice | Previous test unmounted with in-flight page-1 fetch; late success wrote global store & reset `failed` in next test | Tests rendering `PostFeed` MUST await first page before ending | 8/8 repeated runs green |

## Known pre-existing issues (out of scope)
- `auth-store` reads `localStorage` in initializer -> hydration mismatch in sidebar user block when logged in (violates SSR-safe store rule; follow `ui-store` `hydrateLocale()` pattern)
