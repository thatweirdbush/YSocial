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

PostCard -> OwnerPostCard (owner only, 1 useOwnerActions) -> PostCardMenu + PostInlineEditor
  useOwnerActions: beginOwnerOp -> optimistic store -> service(actorId) -> apply service copy | markDeleted | field rollback -> endOwnerOp
UserHoverCard / PostCard header -> useUser(id) + useFollowState(id) (undefined = unknown) + FollowButton -> commitFollow(viewerId, id, follow|unfollow) (see `relationship-controls.md`)
```

## Files
- `src/mocks/seed-authors.ts` - `SEED_AUTHORS`, `SEED_FOLLOWED_AUTHOR_IDS` (shared by posts & profile mocks; replaces `posts/mocks/mock-authors.ts`)
- `src/mocks/relation-graph.ts` (replaced `follow-graph.ts`) - mock backend relation table, lazily seeded per viewer, self-edge ignored. ONLY follow truth for mock services
- `features/auth/store/auth-store.ts` - `GUEST_VIEWER_ID = "me"`, `useViewerId()` (user id or guest)
- `posts/utils/` - `feed-tabs.ts` `getPostFeedTabs`, `pending-feed.ts` `getPendingFeed`, `like-visibility.ts` `getVisibleLikeCount`, `scroll.ts` `scrollFeedToTop` (single scroll owner), `post-content.ts` `POST_CONTENT_MAX = 500` (editor + mock service)
- `posts/services/post-service.ts` - `fetchFeed(tab, page, viewerId)`, `updatePostContent` (validates length / empty-without-images) / `deletePost` (returns `deletedIds` of whole tree) / `setPostPinned` (root only, 1 per author) / `setHideLikeCount` (all take `actorId`, reject `ForbiddenError`; edit/pin/hide return the post copy), `subscribeToNewPosts` (ref-counted `setTimeout` chain, 45s ±10s, 1-2 posts, ids `post-live-*`), `__resetMockDb` resets db + id counter + listeners + timer
- `posts/store/post-store.ts` - adds `incoming` / `consumedIncoming` / `droppedAuthorIds` (`IncomingBuffer`), `deletedIds` (tombstones), `pinnedIdByAuthor`, `ownerOpById`; actions `bufferIncoming`, `flushPending`, `consumeIncoming`, `removePost` (-> `RemovalSnapshot`), `markDeleted`, `restorePosts`, `beginOwnerOp`/`endOwnerOp`, `editPost`, `setPinned`, `setHideLikeCount`, `patchPostIf`; selector `usePostAuthorId`; `INCOMING_CAP = 20`
- `posts/hooks/` - `use-owner-actions.ts` (`useOwnerActions`, `isInViewedSubtree`), `use-new-posts-stream.ts`, `use-pending-feed.ts`
- `posts/components/` - `post-card.tsx` (`PostCard` -> `OwnerPostCard` | `PostCardView`), `new-posts-pill.tsx`, `post-card-menu.tsx` (`owner?: OwnerActions`), `post-inline-editor.tsx`, `post-media-grid.tsx`, `post-lightbox.tsx` (split from `post-card.tsx`)
- `profile/services/user-service.ts` - all fns take `viewerId`; `fetchUser`, `fetchFollowedIds` new; `isFollowing` derived per viewer, `followersCount` global
- `profile/store/user-store.ts` - `users: Record<id, UserProfileBase>` (shared) + `follows: Record<viewerId, ViewerFollows {status, known, loaded, version}>`; `useUser(id)` projects `followStatus`/`isFollowing` + relation flags; `useFollowState(id)` (`FollowStatus | undefined`); `ensureUser`, `ensureFollowGraph`, `getFollowedIds`, `useFollowedIds`
- `profile/components/user-hover-card.tsx` + `components/ui/hover-card.tsx` (shadcn over `radix-ui`); `follow-button.tsx` (`reserveSpace`)
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
16. **I6 - No hover card on the viewer's own name/avatar** (`UserHoverCard` renders children only): viewer ids ("1", "2", "me") are not mock users -> a self card could only fail
17. **I7 - Singular pill label** `feed.newPostsOne` (EN "1 new post")
18. **I8 - Owner op success applies the service copy** field-scoped (edit `content`+`isEdited`, pin via `setPinned` (keeps index), hide `hideLikeCount`): a page-1 refetch that read the DB before the commit cannot leave stale state
19. **I9 - Delete navigates only if still on the start route** (`window.location.pathname === pathname` at resolve): the card is usually unmounted by then, so hook state/refs cannot track navigation
20. **I10 - `restorePosts` never steals a newer pin**: author pinned another post meanwhile -> restored root comes back unpinned (matches service, which unpinned it)
21. **I11 - Follow state known per viewer** (`ViewerFollows.known`): `ensureUser` hits cache ONLY IF graph loaded OR id fetched/toggled for that viewer; `FollowButton` renders null / placeholder while unknown (account switch never shows a guessed "Follow"); hover card loads on unknown follow state. Chosen over "refetch until graph loaded" (no wasted fetches on pages that never load the graph, e.g. search)
22. **I12 - Follow graph retry on every page-1 load** (refresh, first tab load, pill overflow); mount effect alone never retried a failure
23. **I13 - `useOwnerActions` runs only in `OwnerPostCard`** (viewer cards: 0 runners, owner cards: 1 shared by menu & editor). `PostCard` outer selects author id only (`usePostAuthorId`) -> no extra re-render per post update
24. **I14 - Header `FollowButton reserveSpace`**: invisible `aria-hidden` same-size span (same `buttonVariants` + classes) while unknown -> no header shift (measured CLS ~0 at 375px)
25. **I15 - Small guards**: pill overflow refetch in-flight (`disabled` + `aria-busy`); ⋯ trigger `after:-inset-1.5` -> 44px hit area; stream tick reschedules only while a listener remains; hover card `Intl.NumberFormat` module-level per locale

## Known limitations
- `post-store` per-viewer flags (`isLikedByCurrentUser`, `isBookmarkedByCurrentUser`) not viewer-scoped; reset on viewer switch -> 2.7
- Pin shown as badge only; profile ordering waits for F0.6 / 2.1
- Guest composer header shows hard-coded "YSocial Member" fallback while posts are authored by guest "me" (pre-existing, `post-creator-core.tsx`)

## Deferred follow-ups
- None. Final review minors resolved (I8-I15, plan Tasks 14-17, spec §10)

## Testing
- `npm run test` 342 passed / 38 files; `npm run typecheck` 0; `npx eslint src` 62 errors / 25 warnings (baseline 64/25; the 2 `post-card.tsx` errors removed, none new)
- Stream tests: fake timers + `advanceTimersByTimeAsync`; NEVER `runAllTimersAsync` while a listener is subscribed (self-rescheduling timer -> infinite loop)
- Tests rendering `PostCard` MUST mock `usePathname` in `next/navigation` (used via `useOwnerActions`, owner cards only)
- `PostCardMenu` owner tests wrap it in a harness passing `owner={useOwnerActions(id)}` (as `OwnerPostCard` does)
- Delete-navigation tests MUST set the jsdom URL (`window.history.replaceState`) to match the mocked `usePathname`
- Tests that click Refresh MUST await the refetch promise (`fetchFeed` spy `mock.results[n].value`) before ending: a late `setFeedPage` leaks into the next test's store

## Pitfall log
| Symptom | Root cause | Fix | Verification |
|---|---|---|---|
| Edit from the ⋯ menu: editor shown but Esc / typing did nothing, focus on `BODY` | Editor mounted & called `focus()` while Radix DropdownMenu focus scope was still active; on close the scope restores nothing useful | `PostCardMenu` sets a flag on Edit select and calls `onEdit()` from `onCloseAutoFocus` (with `preventDefault`) | Temporary `activeElement` trace (removed); test "swaps the content for the inline editor from the owner menu" |
| Console "two children with the same key" in pill | Avatars keyed by author id; 2 pending posts by 1 author | Distinct authors in `usePendingFeed` | Test "shows each author once even with several pending posts by them" RED -> GREEN |
| `runAllTimersAsync` aborts after 10000 timers | Stream reschedules itself forever while subscribed | Advance bounded time in stream tests | `post-service.test.ts` reset-isolation test |
| Browser pane hidden: Radix menus/lightbox stay mounted (`data-state=closed`), body `pointer-events:none`, screenshots time out | Hidden pane pauses rAF/animations -> `animationend` never fires (environment, not app) | Verify via `find`/JS; menu-driven flows covered by RTL tests | Animations `currentTime` stuck at 0 |
