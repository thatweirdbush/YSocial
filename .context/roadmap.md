---
module: Product Roadmap (FE + BE)
updated: 2026-10-21
---

# YSocial Roadmap

## Context
- **Goal:** full roadmap of features missing vs Threads/X; single source of truth for phase progress (`[x]`, `[-]`, `[ ]`) across FE & BE
- **State:** FE-BE integrated. Slices auth, content, graph, activity run on real BE, as-built: `backend/integration/fe-be-integration.md`; mock mode `NEXT_PUBLIC_REAL_API_SLICES=none` stays for BE-less features. Contract owner: `backend/integration/frontend-backend-mapping.md` (MAP)
- **Real-first rule:** every open phase below is built against real BE where BE has feature; BE-less features use mock adapters behind capability table (`src/lib/capabilities.ts`) until BE adds them. Mismatch found -> decide BE vs FE vs MAP fix & record in owning plan's mismatch log
- **Each sub-project MUST run full cycle:** brainstorm -> spec `docs/specs/YYYY-MM-DD-<topic>-design.md` -> `writing-plans` -> executing-plans -> review -> verify
- **History only:** FE-only phase 0-2 (mock data) closed per `features/*.md`; FE-BE integration closed (plan `backend/plans/2026-10-16-fe-be-integration.md`)

---

## Feature Checklist

### Phase 0 - Foundation
- [x] **F0.1 Test & validate infra:** Vitest + React Testing Library + jsdom, scripts `test` & `typecheck`
- [-] **F0.2 Mock data layer:** *(posts + users + `src/mocks/` seed authors & follow graph done - notifications/saved collections/conversations pending)* centralized seed users/posts/replies/notifications/conversations; `mockDelay()` helper to show real skeleton; stable IDs
- [x] **F0.3 Normalized post store (Zustand):** `Record<id, PostItem>` + selectors `usePost(id)` -> like/bookmark/reply synced everywhere, O(1) toggle, no list re-render
- [-] **F0.4 Route shells:** *(Partial: done `/posts/[id]`, `/search`, `/tags/[tag]`, `/@username` (no `loading.tsx`: it blocks real 404); global not-found, `/`, `/notifications`, `/saved` pending)* `loading.tsx` (size-matched skeleton, anti-CLS), `error.tsx` (retry), `not-found.tsx` (global + profile/post)
- [x] **F0.5 Shared `EmptyState`** (`components/shared/empty-state.tsx`): Lucide icon + Gen Z message + CTA - standard for all lists
- [x] **F0.6 Profile on mocks** (drop real-BE SSR fetch, keep `generateMetadata`)

### Phase 1 - Core content (P0)
> Closed, include follow-ups (`features/feed-post-interaction.md` I8-I15)
- [x] **1.1 Post Detail & Reply Thread** (`features/post-detail.md`) `/posts/[id]`
- [x] **1.2 Search / Explore** (`features/search.md`) `/search?q=` - tabs "Top / Người dùng / Bài viết / Hashtag", recent searches (localStorage), debounced suggestions, keyword highlight; `SearchWidget` navigates here
- [x] **1.3 Hashtag page** (merged into 1.2) `/tags/[tag]` - target for bio parser, trending, linkified post content
- [x] **1.4 New Posts Pill** (`features/feed-post-interaction.md`) - simulated push 45s ±10s, per-tab buffer, X-style
- [x] **1.5 Post owner actions:** Edit (inline, text only, "edited" label), Delete (confirm only, no undo), Pin (badge; profile ordering with 2.1), Hide like count
- [x] **1.6 User hover card** (Radix HoverCard): avatar, bio, follower count, Follow button - on name/avatar in `PostCard`

### Phase 2 - Profile & Social graph (P1)
> Split:
> - **2A Profile Core (DONE, `features/profile.md`):** F0.6 + 2.1 + 2.2 + 2.6 - unblocks rest; Reposts tab moved to 6.1; QR via `qrcode.react`
> - **2B Relationship Controls (DONE, `features/relationship-controls.md`):** 2.3 + 2.4 + 2.5 - `relation-graph` + visibility enforced in mock services (not `post-store` selectors), manager lists mounted in minimal `/settings` (4.1 extends it); Restrict deferred (BE has no concept)
> - **2C Profile Switcher:** 2.7 - touches `auth-store` & every viewer-scoped store; may run after Phase 4
- [x] **2.1 Full profile tabs:** Threads / Replies / Media (grid) / Saved (self); Reposts -> 6.1
- [x] **2.2 Followers / Following** dialog with search & paging
- [x] **2.3 Private account & Follow requests:** Pending state (match BE spec), request approval screen
- [x] **2.4 Close Friends manager:** list + toggle (match `ToggleCloseFriendRequest`), green ring badge on close-friends posts
- [x] **2.5 Block / Mute** (Restrict deferred): `PostCard` menu & profile hide content for real, lists in `/settings/blocked|muted`
- [x] **2.6 Share profile:** copy link + QR code dialog
- [x] **2.7 Multi-profile switcher** (`features/settings.md`): `GET me` + `PUT profiles/switch` in the account menu; cross-tab lock rule, at-most-once switch, `ViewerSync` viewer reset; real-BE smoke passed

### Phase 3 - Notifications (P1)
> Closed: `features/notifications.md`
- [x] **3.1 Filter tabs:** All / Mentions / Replies / Follows / Likes; group "X & 12 others liked"
- [x] **3.2 Unread badge** on nav + mark-on-view, server-authoritative count, bounded read-all
- [x] **3.3 Simulated realtime:** real SignalR push (`NotificationLiveSync`)
- [x] **3.4 Notification settings** (toggle per kind: likes, replies, follows)

### Phase 4 - Settings & Account (P1)
- [x] **4.1 Settings hub** (`features/settings.md`): `/settings` 2-col (desktop) / stack (mobile); routes, `liked` -> `content`, deferrals: see as-built doc
- [x] **4.2 `settings-store`** persisted to localStorage (per device), `useShallow` when selecting multiple fields

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

**Out of scope:** Communities/Lists, Analytics, Scheduled posts, PWA, SSO

## Open items & BE track
- **Open for user/BE owner:** M12 BE option (nullable-reference swagger, wide type churn, no functional gain)
- **BE gaps for FE-built features:** tabs `replies`/`media`, pin, hide-like-count, close-friends audience (D17); register: BG §10
- **Persistence:** DONE (EF Core + PostgreSQL, migrations, rich dev seed, SQLite test harness; BG §7); open debt: SQL-side paging, multi-instance lock/outbox (BG §10)
- **Needs BE design first (DB ready):** search, media upload (spec `docs/specs/2026-10-21-media-design.md`)
- **Done (D31, D32):** hashtags, trending, tag page, suggestions: `features/discovery.md`
- **No FE counterpart yet:** DMs, reposts, polls, report, onboarding
- **Settings deferrals (Phase 4):** reply / mention policy, deactivate, clear birth date (BE), others: register in `features/settings.md` Deferred
- **Notifications follow-ups (BE):** mention notifications, "N others" aggregation over unloaded pages, reply preview text

---

## Verification
- `npm run test` (store/hook tests written first - RED -> GREEN), `npm run typecheck`, `npm run lint` - report exact results, no new errors
- `npm run dev` -> Browser pane `http://localhost:3000`: exercise changed flow with BE running (default) & in mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`) when feature has mock adapter
- Check 375px / 768px / 1440px, light & dark, keyboard focus (`ui-ux-pro-max` Pre-Delivery Checklist)
- Documentation: `conventions/00-agentic-rules.md` §4
