---
module: Post Detail & Reply Thread (FE)
updated: 2026-10-19
spec: ysocial-clients/web-app/docs/specs/2026-10-01-post-detail-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-01-post-detail.md
---

# Post Detail & Reply Thread

`/posts/[id]` thread page (root post or comment + 1-level replies + inline reply composer), backed by `post-service` + normalized Zustand post store shared with feed. Default: real BE (`isRealApi("content")`); `NEXT_PUBLIC_REAL_API_SLICES=none` = mock adapter. As-built integration rules: `backend/integration/fe-be-integration.md`

## Data flow
```
container -> post-service (per fn: isRealApi("content") ? post-service.real : in-memory mock 300-600ms) -> upsertPosts / setFeedPage / setReplies -> post-store
PostCard / PostFeed / ReplyList <- usePost(id) / useFeedIds(tab) / useReplyIds(id)
```
- `features/posts/services/post-service.ts` - dispatcher + mock adapter. Signatures: `fetchFeed(tab, page, viewerId)`, `fetchPostThread(id, actorId)` (`{ post, parent?, replies, childReplies }`; `null` = not found), `createPost(input, author)`, `createReply(parentRef: PostRef, input, author)`, `setPostLike(ref: PostRef, liked)`, `setPostBookmark(ref: PostRef, bookmarked)`. Mock: in-memory DB cloned from mocks; `__resetMockDb()` for tests; `MOCK_FAILURE_RATE` dev flag
- `post-service.real.ts` - same signatures. `PostRef { id, kind, rootPostId }` (`utils/post-ref.ts` `toPostRef`) picks `posts` vs `comments` endpoint; `fetchPostThread` = `GET threads/{id}` (404 / non-GUID id -> `null`, other failures rethrown); `createReply` = `POST comments { postId: rootPostId, parentCommentId? }` (`parentCommentId` only when parent is comment); `createPost` sends text + first http(s) image only. `post-mapper.ts` maps DTOs (missing id/postId/createdAt = `ApiError`)
- `features/posts/store/post-store.ts` - `posts: Record<id, PostItem>`, `replyIds: Record<parentId, id[]>`, `feedIds: Record<FeedTab, id[]>`; actions `upsertPosts`, `setFeedPage`, `setReplies`, `toggleLike(id, seed?)`, `toggleBookmark(id, seed?)`, `addReply`, `removeReply`, `prependPost` (+ owner / buffer / exclusion actions, see `feed-post-interaction.md`)
- `features/posts/mocks/` (mock mode & server metadata) - seed authors from `src/mocks/seed-authors.ts`, roots `post-001...012` (+ `post-cf-*` close-friends, demo-account content), replies `reply-<root>-<nn>` / `reply-demo-*`; `commentsCount` derived from reply count; timestamps offset from module load time (`MOCK_BASE_DATE`). `getMockPostById` for mock-mode server metadata
- `features/posts/hooks/use-current-author.ts` - `AuthUser` -> `PostAuthor` (guest author with `GUEST_ACTOR_ID` fallback)

## UI
- Route `app/posts/[id]/`: `page.tsx` (server, `generateMetadata`, `<PostDetailContainer key={id}>`), `loading.tsx` (`PostDetailShell` + skeleton), `not-found.tsx` (client, i18n), `error.tsx`
- `generateMetadata`: real content = anonymous `serverApiFetch` of `threads/{id}` for metadata only (non-GUID or BE 404 -> generic "not found" title but page still renders; other failure -> neutral title); mock = `getMockPostById` + `isPostPubliclyVisible` (close-friends / private-author posts get generic title)
- `components/detail/`: `PostDetailShell` (page frame + sticky header, shared by route loading & container), container (waits for auth hydration when content is real, then loading -> skeleton, `null` -> `notFound()`, error -> `EmptyState` + retry; refetches when root author becomes blocked / blocking), `PostDetailMain`, header (Back: `router.back()`, or `/` without history), `PostCard variant="detail"`, `ReplyComposer` (`parent: PostRef`), `ReplyList` / `ReplyItem` (<= 2 inline children, "Xem thêm N câu trả lời" -> `/posts/[replyId]`), skeleton
- `PostCard`: `variant: "feed" | "detail" | "compact"`, `replyToUsername`; reads `usePost(id) ?? post`; `aria-label`s `card.like/comment/bookmark/share/more`; `post.isPending` -> `inert` + `aria-busy` + `opacity-60`; content click skipped while text selection active; like/bookmark flip store, then call `setPostLike` / `setPostBookmark(toPostRef(post), next)` & roll back (store toggle + `common.error` toast) when service rejects
- `PostCreatorCore`: `mode="reply"` hides audience & drafts pickers, submit label `postDetail.reply` / `postDetail.replying`; `placeholder` prop; local image upload needs capability `multiImage` & GIF in reply mode too (both off while content is real)
- `PostFeed`: header button `feed.refresh`; next-page failure pauses infinite scroll -> inline retry button in sentinel slot
- `components/shared/empty-state.tsx` shared `EmptyState`
- i18n keys: `postDetail.*`, `card.like|comment|bookmark|share|more`, `feed.refresh`

## Design decisions (NEVER revert without reason)
1. **Service adapters + normalized Zustand** (not TanStack cache) -> like/bookmark/reply synced across feed/detail/profile/saved in O(1); real BE wiring changed ONLY service bodies (`*.real.ts`), stores & components unchanged
2. **Likes/bookmarks persisted through service** (`setPostLike`/`setPostBookmark`). Store-only toggles got clobbered when remounted feed/thread refetched & `upsertPosts` overwrote entity. Real BE persists natively; mock applies change before its latency
3. **`toggleLike(id, seed)`** - Saved page items may not be cached; seed inserted before toggle
4. **ONLY content text + comment button navigate** to thread, not whole `<article>`: lightbox Dialog portal = React child of card -> article-level clicks would fire from inside lightbox
5. **`ReplyComposer` rethrows on failure** after rolling back temp reply - `PostCreatorCore` resets ONLY on success -> typed text survives for retry
6. **Stable empty selector** (`EMPTY_IDS` frozen constant) - returning `[]` inline from Zustand selector -> infinite re-renders
7. **`PostFeed` first-page fetch guarded by `requestedTabsRef`** (key = viewer + tab); `loadPage` independent of `t` (recreated every render) -> no duplicate service calls
8. 1-level nesting ONLY; deeper replies open as own thread (Threads-style)
9. **Feed paging meta (`feedMeta: {loaded, nextPage}`) lives in store**, not `PostFeed` state -> Back from thread renders cached pages instantly (no skeleton, no refetch), matching old TanStack 5-min cache. `setFeedPage(append)` dedupes ids since offset pages shift after `prependPost`
10. **Saved seed items ref shared post mocks** (`getMockPostById`; mock mode only, real mode loads `GET saveditems/posts`) -> every card opens real thread; bookmarked mocks: post-002/006/010
11. **Reply composer Escape**: collapses ONLY when empty (focus returns to bar); with text stays open - shared `DiscardWarningDialog` would save replies into post drafts
12. Feed first-load guard MUST stay **ref** (`cachedFeedTabs()` snapshot): `react-hooks/set-state-in-effect` flags async setState behind useState/getState guard
13. **`PostItem.isPending`** (client-only optimistic flag) -> card `inert`: blocks click/focus/like on temp reply without per-handler guards; server copy never carries it
14. **Infinite scroll paused while tab `failed`** (state guard in observer effect); resume ONLY via inline retry or successful refresh. Ref-lock considered & rejected (YAGNI: flaky double-call was test pollution, not prod race)
15. **Text-selection guard**: `openThread` returns while `getSelection().isCollapsed === false` (drag/double-click select). First click of double-click still navigates (same as Threads/X)
16. **`PostDetailShell` shared** by route `loading.tsx` & container -> header renders identically in both, no 56px jump (CLS)
17. **Container waits for auth hydration (real content)**: anonymous early fetch would 404 follower-only post on hard reload. Server metadata never decides page (soft 404 for unknown ids; deviation from `conventions/frontend.md` section 5 recorded in as-built doc)
18. **Ops take `PostRef`, not bare id**: endpoint (`posts` vs `comments`) & reply target (`rootPostId`) come from caller, never from hidden store lookup; `PostItem.kind` / `rootPostId` are required (mock derives them)

## Testing
- Vitest 4.1 + RTL + jsdom (`npm run test`, `npm run typecheck`)
- `vitest.setup.ts` pins `NEXT_PUBLIC_REAL_API_SLICES=none` (mock mode; tests opt into real slices with `setRealSlices()` from `src/test/api-test-utils.ts`), locale `vi`, stubs `IntersectionObserver` + `ResizeObserver`
- Real-mode coverage: `post-service.real.test.ts`, `post-mapper.test.ts`, `post-detail-container.real.test.tsx`
- Vite 8 Oxc handles TSX (`oxc.jsx.runtime: "automatic"`); `@vitejs/plugin-react` dropped (Babel 8 peer conflict with shadcn); vitest 5 skipped (needs `@types/node` >= 22)

## Pitfall log
| Symptom | Root cause | Fix | Verification |
|---|---|---|---|
| Like on thread -> Back -> feed count reverted | `PostFeed` remount refetched from service (never saw like); `upsertPosts` overwrote store entity | Service persists like/bookmark; `PostCard` calls `setPostLike`/`setPostBookmark` after store toggle | `post-service.test.ts` "persists likes so refetch keeps them", "applies like before fetch that was already in flight resolves"; `post-card.test.tsx` "persists like to service..." |
| Session-created posts sorted below seeds (mock mode) | Fixed `MOCK_BASE_DATE` ahead of real clock | Base = module load time | `post-service.test.ts` "puts created post first in feed" |
| Feed page-2 failure -> endless refetch + stacked toasts | Observer effect re-ran on every render (`loadWithFeedback` identity follows `t`) & on `isFetchingNext` flip; new observer fires at once while sentinel visible -> refetch failed page | Observer effect skips while `failed`; inline retry button | `post-feed.test.tsx` "stops auto-loading after next-page failure..." (`AlwaysVisibleObserver` stub; 82 calls -> 1) |
| Flaky feed test: page 2 called twice | Previous test unmounted with in-flight page-1 fetch; late success wrote global store & reset `failed` in next test | Tests rendering `PostFeed` MUST await first page before ending | 8/8 repeated runs green |
| Follower of private author got 404 on hard reload of `/posts/[id]` (real BE) | Thread fetched before auth hydration = anonymous | Container waits for `useAuthHydrated()` while content is real | `post-detail-container.real.test.tsx` "waits for auth hydration..." |

## Known pre-existing issues (out of scope)
- None recorded (former `auth-store` hydration mismatch is gone: initial state is fixed, storage is read in `hydrate()`)
