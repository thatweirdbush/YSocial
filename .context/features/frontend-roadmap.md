---
module: Frontend Roadmap (FE-only, mock data)
updated: 2026-10-06
---

# YSocial Frontend - Audit & Roadmap (FE-only, mock data)

## Context
- Audit current YSocial FE state + **full** roadmap of features missing vs Threads/X
- **Scope:** UI/UX, components, layouts, Zustand. NO connect BE/API/DB -> all data rendered from FE mocks
- **`brainstorming` classification:** **Architectural** (many independent subsystems) -> this plan is **roadmap + sub-project breakdown**
- **Each sub-project MUST run full cycle:** brainstorm -> spec `docs/specs/YYYY-MM-DD-<topic>-design.md` -> `writing-plans` -> execute (subagent-driven / executing-plans) -> review -> verify
- **Skills applied:** using-superpowers, brainstorming, writing-plans, concise-planning, kaizen, frontend-design, ui-ux-pro-max, nextjs-best-practices, react-best-practices, react-patterns, scroll-experience, tailwind-patterns, seo-audit, lint-and-validate, verification-before-completion, test-driven-development

---

## Step 1 - Current State
> Audit 2026-10-01, status refreshed 2026-10-06 (after Phase 1.1-1.6)

| Route | Feature | Status |
|---|---|---|
| `/` | `posts` - `PostFeed` (mock `post-service` + normalized `post-store`, infinite scroll, "N bài mới" pill from simulated push), `PostCard` (like/bookmark/share, owner menu edit/delete/pin/hide likes, author hover card, store-bound Follow, carousel + fullscreen, linkified `#tag`/`@mention`), skeleton (see `features/feed-post-interaction.md`) | Done |
| `/posts/[id]` | `posts` - thread + 1-level replies, reply composer, loading/error/not-found | Done |
| `/search`, `/tags/[tag]` | `search` - explore landing, 4 result tabs, combobox suggestions, recent searches, tag page | Done |
| dialog/inline | `posts` - `PostCreatorCore/Dialog/Feed`, `post-draft-store` (localStorage), audience picker, discard dialog | Done |
| `/login`, `/register` | `auth` - multi-step login, forgot/reset OTP, `auth-store` | Done |
| `/@username` | `profile` - header, 4 tabs, edit, followers dialog, share + QR, server-resolved route (see `features/profile.md`) | Done (2A) |
| `/notifications` | `notifications` - like/follow/reply list, inline mock `INITIAL_NOTIFICATIONS` | Done (basic) |
| `/saved` | `saved` - collections, manage mode, drag sort, bulk unsave; items = shared post mocks | Done |
| Layout | `main-layout` (sidebar collapse, mobile bottom nav, dropdown), right sidebar (`SearchBox`, live trending, follow suggestions via `user-store`) | Done |

**Technical gaps found:**
1. [x] Nav `/search` 404, Comment button without handler, no `/posts/[id]` -> fixed by 1.1 & 1.2
2. [x] Like/bookmark/follow out of sync -> feed/detail/search/tag/saved share `post-store`/`user-store`; `PostCard` Follow bound to viewer-scoped `user-store` (1.6 done); profile on mocks (F0.6 done)
3. [-] Route shells -> done `/posts/[id]`, `/search`, `/tags/[tag]`; missing global `not-found`, `/`, `/notifications`, `/saved`, `/@username` (F0.4)
4. [x] Need test runner -> Vitest + RTL + jsdom, `test` & `typecheck` scripts (F0.1)
5. [-] Scattered mocks -> posts & users centralized, shared seeds + viewer-scoped follow graph in `src/mocks/`; notifications & saved collections still inline (F0.2)

---

## Steps 2 & 3 - Feature Checklist (priority high -> low)

### Phase 0 - Foundation (MUST go first, blocks all later phases)
- [x] **F0.1 Test & validate infra:** Vitest + React Testing Library + jsdom, scripts `test` & `typecheck` (devDependencies install needs approval)
- [-] **F0.2 Mock data layer:** *(posts + users + `src/mocks/` seed authors & follow graph done - notifications/saved collections/conversations pending)* centralized seed users/posts/replies/notifications/conversations; `mockDelay()` helper to show real skeleton; stable IDs
- [x] **F0.3 Normalized post store (Zustand):** `Record<id, PostItem>` + selectors `usePost(id)` -> like/bookmark/reply synced everywhere, O(1) toggle, no list re-render
- [-] **F0.4 Route shells:** *(Partial: done `/posts/[id]`, `/search`, `/tags/[tag]`, `/@username` (no `loading.tsx`: it blocks real 404); global not-found, `/`, `/notifications`, `/saved` pending)* `loading.tsx` (size-matched skeleton, anti-CLS), `error.tsx` (retry), `not-found.tsx` (global + profile/post)
- [x] **F0.5 Shared `EmptyState`** (`components/shared/empty-state.tsx`): Lucide icon + Gen Z message + CTA - standard for all lists
- [x] **F0.6 Profile on mocks** (drop real-BE SSR fetch, keep `generateMetadata`)

### Phase 1 - Core content loop (P0)
> Closed 2026-10-06, incl. final-review follow-ups (see `features/feed-post-interaction.md` I8-I15). Next: Phase 2 (with F0.6)
- [x] **1.1 Post Detail & Reply Thread** (see `features/post-detail.md`) `/posts/[id]` - *priority #1, see Step 4*
- [x] **1.2 Search / Explore** (see `features/search.md`) `/search?q=` - tabs "Top / Người dùng / Bài viết / Hashtag", recent searches (localStorage), debounced suggestions, keyword highlight; `SearchWidget` navigates here
- [x] **1.3 Hashtag page** (merged into 1.2 spec) `/tags/[tag]` - target for bio parser, trending, linkified post content
- [x] **1.4 "Có bài mới" pill** (see `features/feed-post-interaction.md`) - simulated push 45s ±10s, per-tab buffer, X-style pill
- [x] **1.5 Post owner actions:** Edit (inline, text only, "edited" label), Delete (confirm only, no undo - decided), Pin (badge; profile ordering with 2.1), Hide like count
- [x] **1.6 User hover card** (Radix HoverCard): avatar, bio, follower count, Follow button - on name/avatar in `PostCard`

### Phase 2 - Profile & Social graph (P1)
> Split:
> - **2A Profile Core (DONE 2026-10-08, see `features/profile.md`):** F0.6 + 2.1 + 2.2 + 2.6 - unblocks rest; Reposts tab moved to 6.1; QR via `qrcode.react`
> - **2B Relationship Controls (DONE 2026-10-09, see `features/relationship-controls.md`):** 2.3 + 2.4 + 2.5 - `relation-graph` + visibility enforced in mock services (not `post-store` selectors), manager lists mounted in minimal `/settings` (4.1 extends it); Restrict deferred (BE has no concept)
> - **2C Profile Switcher:** 2.7 - touches `auth-store` & every viewer-scoped store; may run after Phase 4
- [x] **2.1 Full profile tabs:** Threads / Replies / Media (grid) / Saved (self); Reposts -> 6.1
- [x] **2.2 Followers / Following** dialog with search & paging *(routes `/@username/followers|following` dropped, spec D1)*
- [x] **2.3 Private account & Follow requests:** Pending state (match BE spec), request approval screen
- [x] **2.4 Close Friends manager:** list + toggle (match `ToggleCloseFriendRequest`), green ring badge on close-friends posts
- [x] **2.5 Block / Mute** (Restrict deferred): `PostCard` menu & profile hide content for real, lists in `/settings/blocked|muted`
- [x] **2.6 Share profile:** copy link + QR code dialog
- [ ] **2.7 Multi-profile switcher** (match `SwitchProfileRequest`): switch account in sidebar dropdown *(Phase C done: build real-first now, `features/fe-be-integration-roadmap.md`)*

### Phase 3 - Notifications & Activity (P1)
- [ ] **3.1 Filter tabs:** All / Mentions / Replies / Follows / Likes; group "X & 12 others liked"
- [ ] **3.2 Unread badge** on nav (Zustand `notification-store`), mark-all-read, mark-on-view
- [ ] **3.3 Simulated realtime:** timer fires mock notification + toast (prepare SignalR plug-in point)
- [ ] **3.4 Notification settings** (toggle per type) - shares store with Settings

### Phase 4 - Settings & Account (P1)
- [ ] **4.1 Settings hub** `/settings`, 2-col layout (desktop) / stack (mobile), child routes:
  - `account` (email, username, birth date, gender - match `UpdateProfileRequest`), `privacy` (private account, who can reply/mention), `notifications`, `appearance` (theme, font size, reduced motion - moved from dropdown), `language`, `blocked`, `muted`, `close-friends`, `sessions` (device list, remote logout - UI), `danger` (deactivate/delete account UI + confirm)
- [ ] **4.2 `settings-store`** persisted to localStorage, `useShallow` when selecting multiple fields

### Phase 5 - Direct Messages (P2)
- [ ] **5.1 Inbox** `/messages` - conversation list (unread, typing, last message), search
- [ ] **5.2 Chat thread** `/messages/[conversationId]` - bubbles grouped by time, send text/image/emoji, reactions, reply-to, seen status, simulated typing indicator, auto-scroll + "jump to latest"
- [ ] **5.3 Message requests** (strangers) & new conversation (pick user)
- [ ] **5.4 Share post via DM** from `PostCard` Share button

### Phase 6 - Advanced engagement (P2)
- [ ] **6.1 Repost & Quote post** (quote embed card) + profile Reposts tab (moved from 2.1)
- [ ] **6.2 Polls** in composer + vote UI (% results, expiry)
- [ ] **6.3 Advanced composer:** `@mention` & `#hashtag` autocomplete, circular char counter, multi-post thread ("Add to thread"), link preview card
- [ ] **6.4 Drafts page** `/drafts` (store exists) - edit/delete/repost
- [ ] **6.5 Report flow** multi-step dialog (replaces current toast)
- [ ] **6.6 Post-register onboarding:** avatar -> interests -> follow suggestions -> feed

### Phase 7 - Polish & System UX (P3)
- [x] **7.0 MainLayout mobile overflow** - `<main className="w-[600px] shrink-0">` overflows horizontally at 375px; **locale hydration mismatch** (`ui-store` reads `navigator.language` during render). *(pre-existing)*
- [ ] **7.1 Command palette** (Ctrl/Cmd+K) + keyboard shortcuts (`j/k` move post, `l` like, `n` new post, `?` shortcut sheet)
- [ ] **7.2 Offline banner** + retry (Offline Resiliency convention)
- [ ] **7.3 Scroll restoration** feed <-> detail (convention), `content-visibility` for long lists
- [ ] **7.4 Micro-animations:** like "pop & sparkle", share -> ✓, `prefers-reduced-motion`
- [ ] **7.5 A11y pass:** focus ring, icon button `aria-label`, touch target >= 44px, contrast 4.5:1 in both themes
- [-] **7.6 SEO public routes:** `generateMetadata` + OG for `/posts/[id]`, `/@username`, `/tags/[tag]` *(done `/posts/[id]`, `/tags/[tag]`, `/@username`)*

**Out of scope:** real API/SignalR (tracked in `features/fe-be-integration-roadmap.md`), Communities/Lists, Analytics, Scheduled posts, PWA

---

## Step 4 - Structure for priority #1: Phase 0 (F0.2-F0.3) + 1.1 Post Detail & Reply Thread

Reply = post with `parentId` (Threads-like) -> lives in `posts` feature, no new feature.

```
src/app/posts/[id]/
├── page.tsx                       # Thin wrapper: MainLayout + <PostDetailContainer postId>, generateMetadata (from mock)
├── loading.tsx                    # <PostDetailSkeleton />
└── not-found.tsx                  # EmptyState "Bài viết không tồn tại"

src/components/shared/
└── empty-state.tsx                # (F0.5) shared

src/features/posts/
├── components/
|   ├── post-card.tsx              # (edit) Comment -> router.push(`/posts/${id}`); like/bookmark read/write via post-store
|   ├── post-feed.tsx              # (edit) data source = useFeedPostIds() instead of apiClient
|   └── detail/
|       ├── post-detail-container.tsx   # client container: usePost + useReplyIds, not-found state
|       ├── post-detail-header.tsx      # sticky: Back + "Thread"
|       ├── post-detail-main.tsx        # expanded root post (full timestamp, stats)
|       ├── reply-composer.tsx          # reuses PostCreatorCore ("Reply to @username")
|       ├── reply-list.tsx              # replies + "View more replies" (1-level nesting)
|       ├── reply-item.tsx              # compact PostCard + thread line
|       └── post-detail-skeleton.tsx    # matches real size (CLS)
├── mocks/
|   ├── mock-authors.ts            # PostAuthor[] (seed later shared with profile/search)
|   └── mock-posts.ts              # root PostItem[] + replies (parentId), images, timestamps
├── store/
|   ├── post-draft-store.ts        # unchanged
|   ├── post-store.ts              # state: posts: Record<id, PostItem>, replyIds: Record<parentId, id[]>, feedIds: id[]
|   |                              # actions: toggleLike, toggleBookmark, addReply, addPost (optimistic, no API)
|   |                              # selectors: usePost(id), useReplyIds(id), useFeedPostIds(), usePostActions()
|   └── post-store.test.ts         # TDD: toggleLike changes count +/-1, addReply increments commentsCount & prepends to replyIds, unknown id -> no-op
├── types/index.ts                 # PostItem adds parentId?: string, isEdited?: boolean
└── index.ts                       # export PostDetailContainer
```

**Design decisions**
- Normalized store `Record<id>` -> `PostCard` subscribes ONLY `usePost(id)`; like toggle O(1), no whole-feed re-render (`rerender-derived-state`)
- Mocks loaded once at store init (lazy init); later swap to TanStack Query = change source in store/hooks ONLY, UI unchanged
- `page.tsx` stays Server Component (metadata/OG); interactive part = client container (`nextjs-best-practices`)
- Keep cross-feature convention via `@/features/posts` / `@/features/posts/types` (settled); accept slight deviation from `bundle-barrel-imports` rule
- Design: follow existing language (Luxury Minimal, Zinc, thin borders) - NO new animation/icon libs. `ui-ux-pro-max` script needs Python (check if installed) -> use skill's Quick Reference + Pre-Delivery Checklist
- i18n: add `postDetail.*` to `lib/locales/vi.json` & `en.json`

**Reuse:** `PostCard`, `PostCreatorCore`, `PostSkeletonList`, `MainLayout`, `SafeHydration`, `useTranslation`, shadcn `avatar/button/dropdown-menu/scroll-area/skeleton`

---

## Verification (per sub-project)
- `npm run test` (store/hook tests written first - RED -> GREEN), `npm run typecheck`, `npm run lint` - report exact results, no new errors
- `npm run dev` -> Browser pane `http://localhost:3000`: click Comment -> `/posts/[id]`; send reply -> appears immediately, feed `commentsCount` increments; like in detail -> back to feed synced; Back keeps scroll; bad id -> not-found
- Check 375px / 768px / 1440px, light & dark, keyboard focus (`ui-ux-pro-max` Pre-Delivery Checklist)
- Update `.context/features/<feature>.md` + `INDEX.md` after each sub-project (Task Closure Protocol)
