---
module: Feed & Post Interaction (FE, mock data) - roadmap 1.4 + 1.5 + 1.6
updated: 2026-10-06
spec: ysocial-clients/web-app/docs/specs/2026-10-06-feed-post-interaction-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-06-feed-post-interaction.md
---

# Feed & Post Interaction

"N bài mới" pill (simulated push), owner actions (edit / delete / pin / hide like count), author hover card. Follow state single-sourced & viewer-scoped. NEVER calls BE.

## Data flow
```
post-service.subscribeToNewPosts --(PostItem)--> useNewPostsStream (PostFeed, visible tab only)
                                                   -> bufferIncoming (post-store) + ensureUser (user-store)
NewPostsPill <- usePendingFeed(tab) = getPendingFeed(buffered posts, IncomingBuffer, tab, useFollowedIds())
  click -> flushPending(tab, ids) | overflow -> page-1 refetch -> consumeIncoming ; then scrollFeedToTop()

PostCardMenu (owner) -> useOwnerActions: beginOwnerOp -> optimistic store -> service(actorId) -> markDeleted | field rollback -> endOwnerOp
UserHoverCard / PostCard header -> useUser(id) (viewer projection) + FollowButton -> toggleFollow(viewerId, id) + setFollow(id, f, viewerId)
```

## Files
- `src/mocks/seed-authors.ts` - `SEED_AUTHORS`, `SEED_FOLLOWED_AUTHOR_IDS` (shared by posts & profile mocks; replaces `posts/mocks/mock-authors.ts`)
- `src/mocks/follow-graph.ts` - mock backend follow table `Map<viewerId, Set<authorId>>`, lazily seeded per viewer, self-follow ignored. ONLY follow truth for mock services
- `features/auth/store/auth-store.ts` - `GUEST_VIEWER_ID = "me"`, `useViewerId()` (user id or guest)
- `posts/utils/` - `feed-tabs.ts` `getPostFeedTabs`, `pending-feed.ts` `getPendingFeed`, `like-visibility.ts` `getVisibleLikeCount`, `scroll.ts` `scrollFeedToTop` (single scroll owner)
- `posts/services/post-service.ts` - `fetchFeed(tab, page, viewerId)`, `updatePostContent` / `deletePost` (returns `deletedIds` of whole tree) / `setPostPinned` (root only, 1 per author) / `setHideLikeCount` (all take `actorId`, reject `ForbiddenError`), `subscribeToNewPosts` (ref-counted `setTimeout` chain, 45s ±10s, 1-2 posts, ids `post-live-*`), `__resetMockDb` resets db + id counter + listeners + timer
- `posts/store/post-store.ts` - adds `incoming` / `consumedIncoming` / `droppedAuthorIds` (`IncomingBuffer`), `deletedIds` (tombstones), `pinnedIdByAuthor`, `ownerOpById`; actions `bufferIncoming`, `flushPending`, `consumeIncoming`, `removePost` (-> `RemovalSnapshot`), `markDeleted`, `restorePosts`, `beginOwnerOp`/`endOwnerOp`, `editPost`, `setPinned`, `setHideLikeCount`, `patchPostIf`; `INCOMING_CAP = 20`
- `posts/hooks/` - `use-owner-actions.ts` (`useOwnerActions`, `isInViewedSubtree`), `use-new-posts-stream.ts`, `use-pending-feed.ts`
- `posts/components/` - `new-posts-pill.tsx`, `post-card-menu.tsx`, `post-inline-editor.tsx` (`POST_CONTENT_MAX = 500`), `post-media-grid.tsx`, `post-lightbox.tsx` (split from `post-card.tsx`)
- `profile/services/user-service.ts` - all fns take `viewerId`; `fetchUser`, `fetchFollowedIds` new; `isFollowing` derived per viewer, `followersCount` global
- `profile/store/user-store.ts` - `users: Record<id, UserProfileBase>` (shared) + `follows: Record<viewerId, ViewerFollows {ids, loaded, version}>`; `useUser(id)` projects `isFollowing` for `useViewerId()`; `ensureUser`, `ensureFollowGraph`, `getFollowedIds`, `useFollowedIds`
- `profile/components/user-hover-card.tsx` + `components/ui/hover-card.tsx` (shadcn over `radix-ui`)
- i18n: `feed.newPosts*`, `card.*` (owner menu, edited, pinned, hidden likes, delete dialog, forbidden, viewer menu), `hoverCard.*`; `saved.*` added to `TranslationKey` (cleanup, keys pre-existed)

## Design decisions (NEVER revert without reason)
Spec D1-D16 + D5b hold as implemented. Key ones + implementation decisions (I*):
1. **Pending = per-tab consumed ids, classified at READ time** (D5b, D11): following an author makes their buffered posts pending without re-buffering; a post consumed by forYou stays eligible for following
2. **Overflow = dropped authors per unconsumed tab**, read-time classified -> "20+" only on tabs it belongs to; page-1 load (`setFeedPage` append=false) consumes `ids ∩ incoming` & clears it
3. **Ownership enforced by mock service** (`actorId`, `ForbiddenError`); menu visibility is presentation only (D9)
4. **1 pending owner op per post + field-scoped rollback** (`patchPostIf` only while optimistic value unchanged) (D10)
5. **Delete always optimistic**; viewed-route navigation (`router.replace("/")`) only after success; failure -> `restorePosts` (idempotent) (D14). `PostDetailMain` renders null for a missing store post, `notFound()` depends on fetch only
6. **Tombstones** (`deletedIds`): `PostCard` returns null, upsert/buffer/setReplies/setFeedPage skip -> deleted ids never reappear (search/saved lists hold their own props)
7. **Pin index invariant** kept by `reindexPins` in every path entering/leaving the cache, single `set()` for target + previous pin + index
8. **Viewer-scoped follow** (D16): service graph per viewer; store projection per viewer; "following" pending empty until `ensureFollowGraph` loaded (never guessed from partial cache)
9. **Shared seeds in `src/mocks/`** break the `posts -> profile -> mock-users -> posts` import cycle. Remaining barrel cycle (`PostCard -> @/features/profile`, `profile-container -> @/features/posts`) is safe ONLY because cross-feature values are used at render/call time. NEVER use another feature's export at module top level
10. **Single scroll owner** `scrollFeedToTop()` (document scroll, verified `MainLayout`) (D15)
11. **I1 - `PostCard` calls `ensureUser(authorId, viewerId)` on mount** (non-owned posts): `FollowButton` renders nothing for uncached users; deduped & cached per author. Swap for batch author fetch with real API
12. **I2 - Edit opens AFTER the menu closes** (`onCloseAutoFocus` + `preventDefault`), see pitfall
13. **I3 - `bufferIncoming` skips only posts already in BOTH feeds**; in one feed -> buffered & consumed for that feed
14. **I4 - Pill avatars = up to 3 DISTINCT authors**, newest first
15. **I5 - Hidden-likes hint = `EyeOff` svg `role=img` + `aria-label` + `<title>`** (no `TooltipProvider` in app tree)

## Known limitations
- `post-store` per-viewer flags (`isLikedByCurrentUser`, `isBookmarkedByCurrentUser`) not viewer-scoped; reset on viewer switch -> 2.7
- Pin shown as badge only; profile ordering waits for F0.6 / 2.1
- Guest composer header shows hard-coded "YSocial Member" fallback while posts are authored by guest "me" (pre-existing, `post-creator-core.tsx`)

## Testing
- `npm run test` 325 passed / 38 files; `npm run typecheck` 0; `npx eslint src` 62 errors / 25 warnings (baseline 64/25; the 2 `post-card.tsx` errors removed, none new)
- Stream tests: fake timers + `advanceTimersByTimeAsync`; NEVER `runAllTimersAsync` while a listener is subscribed (self-rescheduling timer -> infinite loop)
- Tests rendering `PostCard` MUST mock `usePathname` in `next/navigation` (used via `useOwnerActions`)

## Pitfall log
| Symptom | Root cause | Fix | Verification |
|---|---|---|---|
| Edit from the ⋯ menu: editor shown but Esc / typing did nothing, focus on `BODY` | Editor mounted & called `focus()` while Radix DropdownMenu focus scope was still active; on close the scope restores nothing useful | `PostCardMenu` sets a flag on Edit select and calls `onEdit()` from `onCloseAutoFocus` (with `preventDefault`) | Temporary `activeElement` trace (removed); test "swaps the content for the inline editor from the owner menu" |
| Console "two children with the same key" in pill | Avatars keyed by author id; 2 pending posts by 1 author | Distinct authors in `usePendingFeed` | Test "shows each author once even with several pending posts by them" RED -> GREEN |
| `runAllTimersAsync` aborts after 10000 timers | Stream reschedules itself forever while subscribed | Advance bounded time in stream tests | `post-service.test.ts` reset-isolation test |
| Browser pane hidden: Radix menus/lightbox stay mounted (`data-state=closed`), body `pointer-events:none`, screenshots time out | Hidden pane pauses rAF/animations -> `animationend` never fires (environment, not app) | Verify via `find`/JS; menu-driven flows covered by RTL tests | Animations `currentTime` stuck at 0 |
