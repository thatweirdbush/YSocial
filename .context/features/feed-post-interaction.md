---
module: Feed & Post Interaction (FE) - roadmap 1.4 + 1.5 + 1.6
updated: 2026-10-19
spec: ysocial-clients/web-app/docs/specs/2026-10-06-feed-post-interaction-design.md
plan: ysocial-clients/web-app/docs/plans/2026-10-06-feed-post-interaction.md
---

# Feed & Post Interaction

"N bài mới" pill (simulated push), owner actions (edit / delete / pin / hide like count), author hover card. Follow state single-sourced & viewer-scoped. Slice mode: default real BE; pill, stream, pin & hide-likes are mock-only features (capabilities `newPostsPill`, `pin`, `hideLikeCount` are off while content is real, see `src/lib/capabilities.ts`); edit & delete run against BE. As-built integration rules: `backend/integration/fe-be-integration.md`

## Data flow
```
(mock mode only) post-service.subscribeToNewPosts --(PostItem)--> useNewPostsStream (PostFeed, visible tab only)
                                                   -> bufferIncoming (post-store) + ensureUser (user-store)
NewPostsPill <- usePendingFeed(tab) = getPendingFeed(buffered posts, IncomingBuffer, tab, useFollowedIds())
  click -> flushPending(tab, ids) | overflow -> page-1 refetch -> consumeIncoming ; then scrollFeedToTop()

PostCard -> OwnerPostCard (owner only, 1 useOwnerActions) -> PostCardMenu + PostInlineEditor
  useOwnerActions: beginOwnerOp -> optimistic store -> service(PostRef, actorId) -> apply service copy | markDeleted | field rollback -> endOwnerOp
UserHoverCard / PostCard header -> useUser(id) + useFollowState(id) (undefined = unknown) + FollowButton -> commitFollow(actorId, id, follow|unfollow) (see `relationship-controls.md`)
```

## Files
- `src/mocks/seed-authors.ts` - `SEED_AUTHORS`, `SEED_FOLLOWED_AUTHOR_IDS` (shared by posts & profile mocks)
- `src/mocks/relation-graph.ts` - mock backend relation table, lazily seeded per viewer, self-edge ignored. ONLY follow truth for mock services (real graph: `relation-service.real.ts` / `user-service.real.ts`)
- `features/auth/store/auth-store.ts` - `GUEST_ACTOR_ID = "me"`, `useActorId()` / `getActorId()` (user id or guest id), `useViewerId()` (user id or `null`)
- `posts/utils/` - `feed-tabs.ts` `getPostFeedTabs`, `pending-feed.ts` `getPendingFeed`, `like-visibility.ts` `getVisibleLikeCount`, `scroll.ts` `scrollFeedToTop` (single scroll owner), `post-content.ts` `POST_CONTENT_MAX = 500` (editor + mock service), `post-ref.ts` `toPostRef`
- `posts/services/post-service.ts` - dispatcher: `fetchFeed(tab, page, viewerId)`, `updatePostContent(ref: PostRef, content, actorId)` / `deletePost(ref: PostRef, actorId)` (returns `deletedIds`) dispatch to `post-service.real.ts` when content is real. Mock-only (no dispatch, no BE endpoint): `setPostPinned(id, pinned, actorId)` (root only, 1 per author), `setHideLikeCount(id, hidden, actorId)`, `subscribeToNewPosts` (ref-counted `setTimeout` chain, 45s +-10s, 1-2 posts, ids `post-live-*`). Mock owner ops enforce ownership (`ForbiddenError`; edit also validates length / empty-without-images; mock delete removes whole tree); real edit = `PUT posts|comments/{id}` by `ref.kind`, real delete = `DELETE` reporting only target id (`deletedIds: [ref.id]`, no cascade). `__resetMockDb` resets db + id counter + listeners + timer
- `posts/store/post-store.ts` - adds `incoming` / `consumedIncoming` / `droppedAuthorIds` (`IncomingBuffer`), `deletedIds` (tombstones), `pinnedIdByAuthor`, `ownerOpById`, `excludedAuthors` (blocked / muted authors purged from feeds, buffer & reply lists; `excludeAuthor` / `includeAuthor` / `setExcludedAuthors` / `resetViewerFeeds`); actions `bufferIncoming`, `flushPending`, `consumeIncoming`, `removePost` (-> `RemovalSnapshot`), `markDeleted`, `restorePosts`, `beginOwnerOp`/`endOwnerOp`, `editPost`, `setPinned`, `setHideLikeCount`, `patchPostIf`; selectors `usePostAuthorId`, `useIsAuthorBlocked`; `INCOMING_CAP = 20`
- `posts/hooks/` - `use-owner-actions.ts` (`useOwnerActions`, `isInViewedSubtree`), `use-new-posts-stream.ts` (no-op unless capability `newPostsPill`), `use-pending-feed.ts`
- `posts/components/` - `post-card.tsx` (`PostCard` -> `OwnerPostCard` | `PostCardView`), `new-posts-pill.tsx` (rendered only with capability `newPostsPill`), `post-card-menu.tsx` (`owner?: OwnerActions`; Pin / hide-likes items gated by capabilities `pin` / `hideLikeCount`), `post-inline-editor.tsx`, `post-media-grid.tsx`, `post-lightbox.tsx` (split from `post-card.tsx`)
- `profile/services/user-service.ts` - dispatcher, all fns take `actorId`; `fetchUser`, `fetchFollowedIds` dispatch to `user-service.real.ts` via `isRealApi("content")`; `isFollowing` derived per viewer, `followersCount` global
- `profile/store/user-store.ts` - `users: Record<id, UserProfileBase>` (shared) + `follows: Record<actorId, ViewerFollows {status, known, loaded, version}>`; `useUser(id)` projects `followStatus`/`isFollowing` + relation flags; `useFollowState(id)` (`FollowStatus | undefined`); `ensureUser`, `ensureFollowGraph`, `getFollowedIds`, `useFollowedIds`
- `profile/components/user-hover-card.tsx` + `components/ui/hover-card.tsx` (shadcn over `radix-ui`); `follow-button.tsx` (`reserveSpace`)
- i18n: `feed.newPosts*`, `card.*` (owner menu, edited, pinned, hidden likes, delete dialog, forbidden, viewer menu), `hoverCard.*`

## Design decisions
Spec D1-D16 + D5b hold as implemented (later spec decisions D20 / D25 / D26 cover exclusions & viewer switch). Key ones + implementation decisions (I*):
1. **Pending = per-tab consumed ids, classified at READ time** (D5b, D11): following author makes their buffered posts pending without re-buffering; post consumed by forYou stays eligible for following
2. **Overflow = dropped authors per unconsumed tab**, read-time classified -> "20+" only on tabs it belongs to; page-1 load (`setFeedPage` append=false) consumes `ids ∩ incoming` & clears it
3. **Ownership enforced by mock service** (`actorId`, `ForbiddenError`); menu visibility is presentation only (D9). Real adapter does not map BE 403 to `ForbiddenError`: any failure shows generic `common.error` toast
4. **1 pending owner op per post + field-scoped rollback** (`patchPostIf` only while optimistic value unchanged) (D10)
5. **Delete always optimistic**; viewed-route navigation (`router.replace("/")`) only after success; failure -> `restorePosts` (idempotent) (D14). `PostDetailMain` renders null for missing store post, `notFound()` depends on fetch only
6. **Tombstones** (`deletedIds`): `PostCard` returns null, upsert/buffer/setReplies/setFeedPage skip -> deleted ids never reappear (search/saved lists hold their own props)
7. **Pin index invariant** kept by `reindexPins` in every path entering/leaving cache, single `set()` for target + previous pin + index (pin is mock-only while content is real)
8. **Viewer-scoped follow** (D16): service graph per viewer; store projection per viewer; "following" pending empty until `ensureFollowGraph` loaded (never guessed from partial cache)
9. **Shared seeds in `src/mocks/`** break `posts -> profile -> mock-users -> posts` import cycle. Remaining barrel cycle (`PostCard -> @/features/profile`, `profile-container -> @/features/posts`) is safe ONLY because cross-feature values are used at render/call time. NEVER use another feature's export at module top level
10. **Single scroll owner** `scrollFeedToTop()` (document scroll, verified `MainLayout`) (D15)
11. **I1 - `PostCard` calls `ensureUser(authorId, viewerId)` on mount** (non-owned posts): `FollowButton` renders nothing for uncached users; deduped & cached per author. One `fetchUser` per author (real: `user-service.real`); no batch author fetch yet
12. **I2 - Edit opens AFTER menu closes** (`onCloseAutoFocus` + `preventDefault`), see pitfall
13. **I3 - `bufferIncoming` skips only posts already in BOTH feeds**; in 1 feed -> buffered & consumed for that feed
14. **I4 - Pill avatars = up to 3 DISTINCT authors**, newest first
15. **I5 - Hidden-likes hint = `EyeOff` svg `role=img` + `aria-label` + `<title>`** (no `TooltipProvider` in app tree)
16. **I6 - No hover card on viewer's own name/avatar** (`UserHoverCard` renders children only when `userId === actorId`): viewer is not loadable mock user, so self card could only fail
17. **I7 - Singular pill label** `feed.newPostsOne` (EN "1 new post")
18. **I8 - Owner op success applies service copy** field-scoped (edit `content`+`isEdited`, pin via `setPinned` (keeps index), hide `hideLikeCount`): page-1 refetch that read DB before commit cannot leave stale state
19. **I9 - Delete navigates only if still on start route** (`window.location.pathname === pathname` at resolve): card is usually unmounted by then, so hook state/refs cannot track navigation
20. **I10 - `restorePosts` never steals newer pin**: author pinned another post meanwhile -> restored root comes back unpinned (matches service, which unpinned it)
21. **I11 - Follow state known per viewer** (`ViewerFollows.known`): `ensureUser` hits cache ONLY IF graph loaded OR id fetched/toggled for that viewer; `FollowButton` renders null / placeholder while unknown (account switch never shows guessed "Follow"); hover card loads on unknown follow state. Chosen over "refetch until graph loaded" (no wasted fetches on pages that never load graph, e.g. search)
22. **I12 - Follow graph retry on every page-1 load** (refresh, first tab load, pill overflow); mount effect alone never retried failure
23. **I13 - `useOwnerActions` runs only in `OwnerPostCard`** (viewer cards: 0 runners, owner cards: 1 shared by menu & editor). `PostCard` outer selects author id only (`usePostAuthorId`) -> no extra re-render per post update
24. **I14 - Header `FollowButton reserveSpace`**: invisible `aria-hidden` same-size span (same `buttonVariants` + classes) while unknown -> no header shift (measured CLS ~0 at 375px)
25. **I15 - Small guards**: pill overflow refetch in-flight (`disabled` + `aria-busy`); ⋯ trigger `after:-inset-1.5` -> 44px hit area; stream tick reschedules only while listener remains; hover card `Intl.NumberFormat` module-level per locale
26. **Ops take `PostRef`** (`toPostRef(post)`): edit & delete route to `posts` vs `comments` by `kind`, never by store lookup
27. **Real content slice hides BE-less owner features by capability, not by mock fallback**: mock pin / hide call with real id would hit mock DB. Capability table: `src/lib/capabilities.ts`

## Known limitations
- `post-store` per-viewer flags (`isLikedByCurrentUser`, `isBookmarkedByCurrentUser`) not viewer-scoped; cached posts stay across viewer switch (`resetViewerFeeds` clears feeds, paging, buffer & exclusions only) -> roadmap 2.7
- Pin / hide-likes / new-posts pill have no BE endpoint: absent while content is real, working in mock mode only
- Guest composer header shows hard-coded "YSocial Member" fallback while posts are authored by guest actor "me" (`post-creator-core.tsx`)

## Deferred follow-ups
- None. Final review minors resolved (I8-I15, plan Tasks 14-17, spec §10)

## Testing
- `npm run test`, `npm run typecheck`, `npx eslint src` (as-built lint baseline: 0 errors, see `backend/integration/fe-be-integration.md`); `vitest.setup.ts` pins mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`), real-mode tests opt in via `setRealSlices()`
- Stream tests: fake timers + `advanceTimersByTimeAsync`; NEVER `runAllTimersAsync` while listener is subscribed (self-rescheduling timer -> infinite loop)
- Tests rendering `PostCard` MUST mock `usePathname` in `next/navigation` (used via `useOwnerActions`, owner cards only)
- `PostCardMenu` owner tests wrap it in harness passing `owner={useOwnerActions(id)}` (as `OwnerPostCard` does)
- Delete-navigation tests MUST set jsdom URL (`window.history.replaceState`) to match mocked `usePathname`
- Tests that click Refresh MUST await refetch promise (`fetchFeed` spy `mock.results[n].value`) before ending: late `setFeedPage` leaks into next test's store

## Pitfall log
| Symptom | Root cause | Fix | Verification |
|---|---|---|---|
| Edit from ⋯ menu: editor shown but Esc / typing did nothing, focus on `BODY` | Editor mounted & called `focus()` while Radix DropdownMenu focus scope was still active; on close scope restores nothing useful | `PostCardMenu` sets flag on Edit select & calls `onEdit()` from `onCloseAutoFocus` (with `preventDefault`) | Temporary `activeElement` trace (removed); test "swaps content for inline editor from owner menu" |
| Console "two children with the same key" in pill | Avatars keyed by author id; 2 pending posts by 1 author | Distinct authors in `usePendingFeed` | Test "shows each author once even with several pending posts by them" RED -> GREEN |
| `runAllTimersAsync` aborts after 10000 timers | Stream reschedules itself forever while subscribed | Advance bounded time in stream tests | `post-service.test.ts` reset-isolation test |
| Browser pane hidden: Radix menus/lightbox stay mounted (`data-state=closed`), body `pointer-events:none`, screenshots time out | Hidden pane pauses rAF/animations -> `animationend` never fires (environment, not app) | Verify via `find`/JS; menu-driven flows covered by RTL tests | Animations `currentTime` stuck at 0 |
