---
module: Post Detail & Reply Thread (FE, mock data)
updated: 2026-10-01
spec: ysocial-clients/web-app/docs/specs/2026-10-01-post-detail-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-01-post-detail.md
---

# Post Detail & Reply Thread

`/posts/[id]` thread page (root post + 1-level replies + inline reply composer) backed by a mock service and a normalized Zustand post store shared with the feed. **No backend calls** in this flow.

## Data flow
```
container ─▶ post-service (async mock, 300–600ms) ─▶ upsertPosts / setFeedPage / setReplies ─▶ post-store
PostCard / PostFeed / ReplyList ◀── usePost(id) / useFeedIds(tab) / useReplyIds(id)
```
- `features/posts/services/post-service.ts` — `fetchFeed(tab, page)`, `fetchPostThread(id)` (`{ post, parent?, replies, childReplies }`), `createPost`, `createReply`, `setPostLike(id, liked)`, `setPostBookmark(id, bookmarked)`. In-memory db cloned from mocks; `__resetMockDb()` for tests; `MOCK_FAILURE_RATE` dev flag. **Swap point for the real API.**
- `features/posts/store/post-store.ts` — `posts: Record<id, PostItem>`, `replyIds: Record<parentId, id[]>`, `feedIds: Record<FeedTab, id[]>`; actions `upsertPosts`, `setFeedPage`, `setReplies`, `toggleLike(id, seed?)`, `toggleBookmark(id, seed?)`, `addReply`, `removeReply`, `prependPost`.
- `features/posts/mocks/` — 8 authors (3 followed), 12 roots `post-001…012`, replies `reply-<root>-<nn>[-<mm>]`; `commentsCount` derived from reply count; timestamps offset from module load time. `getMockPostById` for server metadata.
- `features/posts/hooks/use-current-author.ts` — `AuthUser` → `PostAuthor` (guest fallback).

## UI
- Route `app/posts/[id]/`: `page.tsx` (server, `generateMetadata`, `<PostDetailContainer key={id}>`), `loading.tsx`, `not-found.tsx` (client, i18n), `error.tsx`.
- `components/detail/`: container (loading → skeleton, null → `notFound()`, error → EmptyState + retry), header (Back: `router.back()` or `/` without history), `PostCard variant="detail"`, `ReplyComposer`, `ReplyList` / `ReplyItem` (≤ 2 inline children, "Xem thêm N câu trả lời" → `/posts/[replyId]`), skeleton.
- `PostCard`: `variant: "feed" | "detail" | "compact"`, `replyToUsername`; reads `usePost(id) ?? post`; `aria-label`s `card.like/comment/bookmark/share`.
- `PostCreatorCore`: `mode="reply"` hides audience & drafts pickers; `placeholder` prop.
- `components/shared/empty-state.tsx` shared EmptyState.
- i18n keys: `postDetail.*`, `card.like|comment|bookmark|share`.

## Design decisions (do not revert without reason)
1. **Mock service + normalized Zustand** (not TanStack cache) — like/bookmark/reply stay in sync across feed/detail/profile/saved in O(1); only service bodies change when the API is wired.
2. **Likes/bookmarks are persisted in the service** (`setPostLike`/`setPostBookmark`, applied before latency). Store-only toggles were clobbered when a remounted feed/thread refetched and `upsertPosts` overwrote the entity.
3. **`toggleLike(id, seed)`** — Saved page items may not be cached; the seed is inserted before toggling.
4. **Only the content text + comment button navigate** to the thread, not the whole `<article>`: the lightbox Dialog portal is a React child of the card, so article-level clicks would fire from inside the lightbox.
5. **ReplyComposer rethrows on failure** after rolling back the temp reply — `PostCreatorCore` resets only on success, so the typed text survives for retry.
6. **Stable empty selector** (`EMPTY_IDS` frozen constant) — returning `[]` inline from a Zustand selector causes infinite re-renders.
7. **PostFeed first-page fetch guarded by `requestedTabsRef`** and `loadPage` independent of `t` (recreated every render) — avoids duplicate service calls.
8. 1-level nesting only; deeper replies open as their own thread (Threads-style).

## Testing
Vitest 4.1 + RTL + jsdom (`npm run test`, `npm run typecheck`). `vitest.setup.ts` pins locale `vi` and stubs `IntersectionObserver`. Vite 8 Oxc handles TSX (`oxc.jsx.runtime: "automatic"`) — `@vitejs/plugin-react` dropped (Babel 8 peer conflict with shadcn); vitest 5 skipped (needs `@types/node` ≥ 22).

## Pitfall log
- **Symptom:** like on thread → Back → feed count reverted. **Root cause:** `PostFeed` remount refetched from service (which never saw the like) and `upsertPosts` overwrote the store entity. **Fix:** service persists like/bookmark; PostCard calls `setPostLike`/`setPostBookmark` after the store toggle. **Verification:** `post-service.test.ts` "persists likes so a refetch keeps them", "applies a like before a fetch that was already in flight resolves"; `post-card.test.tsx` "persists the like to the service…".
- **Symptom:** session-created posts sorted below seeds. **Root cause:** fixed `MOCK_BASE_DATE` ahead of the real clock. **Fix:** base = module load time. **Verification:** `post-service.test.ts` "puts a created post first in the feed".

## Known pre-existing issues (out of scope)
- `MainLayout` `<main className="w-[600px] shrink-0">` overflows horizontally on 375px (all routes).
- Hydration mismatch in `MainLayout` nav labels: `ui-store` reads locale from `navigator.language` during render (server "vi" vs client "en").
