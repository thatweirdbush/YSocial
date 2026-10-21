---
module: Notifications (Roadmap Phase 3) - design
date: 2026-10-20
status: implemented (rev 2 + mismatch log)
---

# Notifications - Phase 3 design (FE + BE vertical slice)

## 1. Scope & classification

| Item | Class | Outcome |
|---|---|---|
| 3.1 Filter tabs + grouping | vertical | BE `kind` filter (D26) + FE per-filter lists + client grouping |
| 3.2 Unread badge + mark-on-view | vertical (small BE) | nav badge, unread sync, BOUNDED mark-all (`upToId`, D28) |
| 3.3 Simulated realtime | closed | superseded: real SignalR push already live (`NotificationLiveSync`); no mock timer |
| 3.4 Notification settings | BE-gap-first | per-kind preferences (D27) + `/settings/notifications` |

Out of scope: mention notifications on BE (no mention model, BG §9), BE-side grouping/aggregation, push preview text, batch mark-read endpoint

## 2. Contract delta (MAP update BEFORE FE tasks)

### 2.1 D26: kind filter on list
- `GET /api/notifications?kind=like|reply|follow&page&pageSize`
- Order: access filter -> kind filter -> count -> page. `totalCount`/`hasNextPage` follow filtered list
- `unreadCount` stays OVERALL (not per kind): badge never changes when tab changes
- Kind mapping (single source, domain, reused by FE mapper): `NewLike` -> like | `NewComment` -> reply | `NewFollow`, `FollowRequested`, `FollowAccepted` -> follow
- `kind` validation (same style as `GET /api/feed` `tab`: case-insensitive, validator + 400 `ValidationFailed` with `errors.kind`, no new code):

| Input | Result |
|---|---|
| absent | all |
| `kind=` (empty) | binds to null -> all (pinned by integration test) |
| whitespace, unknown (`mention`, `x`) | 400 |
| `Like`, `LIKE` | accepted (case-insensitive, like feed) |
| repeated `kind=a&kind=b` | observed in integration test, documented in MAP, no custom binder (single string param: expected invalid -> 400) |

### 2.2 D27: notification preferences
- `GET /api/notifications/preferences` -> 200 `NotificationPreferencesDto { likes, replies, follows }` (all `bool`)
- `PUT /api/notifications/preferences` body `{ likes, replies, follows }` (all `bool?`, `NotNull` validator) -> 200 DTO (full replace)
  - Missing field -> 400 `ValidationFailed` (plain `bool` would bind to `false` & silence notifications user never touched)
- `[Authorize]` (controller-level); route does not clash with `{id:guid}`
- Type semantics (explicit):
  - `likes` = `NewLike`: covers likes on posts & on replies (comment like notifies comment author, `targetId` = root post)
  - `replies` = `NewComment`: notifies POST author only; reply to your reply notifies nobody today -> UI label "replies to your posts"
  - `follows` = `NewFollow`, `FollowRequested`, `FollowAccepted` (follow-requests banner still lists pending requests)
- Preference off -> `NotificationPublisher` skips like self notifications: NO row, NO outbox push. Turning back on does not backfill
- Storage: owned value object `NotificationPreferences { Likes, Replies, Follows }` on `User` (per profile, inline columns like `PrivacySettings`). Migration MUST default existing rows to `true`

### 2.3 D28: bounded mark-all-read
- `PUT /api/notifications/read-all?upToId=<guid>` (param optional; absent = today's behavior)
- Server loads that notification & marks own unread rows with `CreatedAt <= its CreatedAt`; later rows stay unread (prevents marking unseen arrivals as read)
- Id, not timestamp: JS `Date` has ms, Postgres microseconds -> timestamp watermark could exclude newest item; id can only err toward "left unread" (safe)
- Unknown id -> 404; foreign id -> 403 `NotNotificationRecipient` (same as `PUT {id}/read`); lookup skips access filter (sender may have been blocked after page load). 204 on success, idempotent

### 2.4 Capability table
- `mentionNotifications: (s) => !s.has("activity") && !s.has("content")`: ON only when data source can produce mentions (mock seed is used only when BOTH slices are mock; `activity` real reads BE list, so `unlessContentReal` would show always-empty tab). Add to capability tests
- Real mode never sends `kind=mention` (BE would 400): service returns empty page. `NotificationKind` gains `mention` (mock only; mapper unchanged)

## 3. BE design
- `GetNotificationsQuery(Page, PageSize, Kind?)`; Kind->type set lives next to `NotificationType` (domain); handler filters `visible` before slicing; `unreadCount` from unfiltered `visible`
- `MarkAllNotificationsAsReadCommand(UpToId?)`; unbounded path unchanged
- Prefs: `User.UpdateNotificationPreferences(...)`, `GetNotificationPreferences` query, `UpdateNotificationPreferences` command
- `NotificationPublisher`: load recipient via `IUserRepository`, check preference of type's kind, return before `Notification.Create` when off; recipient missing/deleted -> skip, no throw
- Migration `AddNotificationPreferences` (default true); `ModelTests` snapshot, `SeederTests` green

## 4. FE design

### 4.1 Store
- State: normalized `byId` + `lists: Record<Filter, { ids, nextPage, status, loadingMore }>`, `Filter = all | mentions | replies | follows | likes`; global `unreadCount`
- Existing exports keep names, gain optional `filter` (default `all`); `refreshNotifications` refreshes only loaded lists; reset bumps `generation` & clears all
- Push dedup against `byId` (not one list); prepends to `all` + its kind list only when loaded
- Tab switch loads lazily (size-matched skeleton); per-list error + retry

### 4.2 Unread count: server authoritative (fixes existing races)
- Client changes count in exactly 2 ways: optimistic -1 on single mark-read, +1 on accepted push. Never recount from loaded items
- `pushSeq` increments on every accepted push. A count from response that STARTED before latest push is not applied (page 1, refresh, `unread-count`); items still merge, then `syncUnreadCount()` is re-issued once. (Fixes current `loadNotifications`/`refreshNotifications` overwriting push's +1)
- `syncUnreadCount()` (generation-guarded): on mount for any signed-in viewer (both modes), on resume while `all` not ready, after mark-all (success or failure), after block purge & after unblock (LiveSync relation subscription). Ignored while `all` is ready only when no newer push (page count is authoritative otherwise)
- Block: `dropNotificationsFrom` purges locally for instant UI, then `syncUnreadCount()` (unloaded items of that sender are still in count until server answers)
- Reset on logout in both modes (LiveSync restructured: hub stays real-only, count sync does not)

### 4.3 Mark-all-read (bounded, single flight)
- Watermark = newest item id of `all`. Optimistic flip touches only items at or older than it; later pushes stay unread
- One mark-all in flight at a time: auto trigger & manual button share same promise (duplicate calls collapse)
- Failure: revert ONLY ids this call flipped, then `syncUnreadCount()`; NEVER restore snapshotted count (current code wipes concurrent push +1). Success: `syncUnreadCount()` too (server also marked unloaded older pages). Generation reset drops both paths
- Auto trigger (mark-on-view) only when: route mounted, `document.visibilityState === "visible"`, `all` ready, unread > 0. While hidden, pushes stay unread; on visible again, run again with fresh watermark
- "Fresh" highlight: unread ids snapshotted ONCE per visit into local state (survives flip). StrictMode dev double-effect must not re-snapshot from already-flipped list (guard + test). Pushes arriving while visible -> `commitMarkRead(id)`
- Navigating away mid-request: request completes (store is global), no UI effect; reset (logout/switch) discards

### 4.4 Tabs & grouping
- Tabs: All / Mentions (capability) / Replies / Follows / Likes; tab = server filter => correct paging per tab
- `groupNotifications(items)`: pure, memoized from current lists (never stored) => regroups after pagination & pushes
  - Likes only; key = `postId`; 24h window from group's NEWEST member; walk newest-first, add like to open group if within window, else open new group; group id = newest member id; group sits at newest member; unread if any member unread; up to 3 stacked avatars
  - N = exact number of LOADED members (never post `likesCount`); wording "X & N others liked", never implying unseen totals; i18n keys `notifications.groupedLike` / `groupedLikeOne` (params `{name}`, `{count}`)
  - Opening group marks all its unread members read
  - Known limit: older unloaded pages only extend tail groups when loaded
- PREREQ: mock seed `createdAt` is display text ("10m ago"); window logic & "newest" need parseable dates -> convert seed to ISO (relative to `now` at module load) & keep display formatting in `notification-item` `formatTime` only (drop "already display text" branch)

### 4.5 Badge
- `NotificationNavBadge` (feature `index.ts`) in 3 nav renders of `main-layout.tsx`: numeric pill, `99+` cap, accent token, absolutely positioned (no layout shift), link `aria-label` includes count; hidden for guest

### 4.6 Settings (3.4)
- `src/app/settings/(sections)/notifications/page.tsx` thin, `noindex`; `NotificationsSection` in `features/settings`; entry in `SETTINGS_SECTIONS`
- Data: TanStack Query. Skeleton until GET succeeds; GET error -> retry; NO toggles before load
- Coalescing, latest wins: at most 1 PUT in flight; toggles meanwhile update desired state + dirty flag; on settle, if dirty send FULL desired object. `cancelQueries` before each optimistic write (late GET cannot overwrite). Keep last server-confirmed value; on error revert to it only if no newer change is pending, toast. No invalidate while anything pending
- Decision: prefs are server state => NOT in future localStorage `settings-store` (4.2)

## 5. Edge cases
- Block: purge from `byId` + all lists, resync count (§4.2)
- Push of a kind whose list is not loaded: `byId`/`all` only; count +1
- Guest: no request, empty lists, badge hidden
- Prefs off while push is in flight: already enqueued -> delivered once (accepted)
- Account switch: reset drops in-flight responses (generation guard)
- Push arrives during `read-all`: stays unread (above watermark), count re-synced after

## 6. Tests (RED first)
- BE: kind filter (each kind, absent, empty, invalid, case, repeated param, `unreadCount` overall, paging counts); `upToId` (older marked, newer untouched, unknown 404, foreign 403, absent = all); prefs GET default, PUT replace, missing field 400, 401; publisher skips per kind (post-like & reply-like both covered by `likes`) & still notifies others; migration default true; Swagger contract tests
- FE store: filters, push routing, mark-read cross-list, reset, push during page load (count not overwritten), push during `unread-count`, mark-all failure with concurrent push (count intact), duplicate mark-all collapses, near-tie watermark, block + unblock resync
- FE UI: tabs, `groupNotifications` (window edges, regroup after page/push), badge (cap, aria), mark-on-view (hidden tab, StrictMode double effect, fresh highlight), capability (`activity` real + content mock => no Mentions), settings (A off, A on, B off with first PUT failing; no toggle before load)

## 7. Exit docs
- MAP §2.7/§3/§7 (D26, D27, D28) first; BG §7.5/§11; DM §2; `backend-unit-test.md`; new `.context/features/notifications.md` + INDEX entry; roadmap ticks (3.3 closed with rationale); `fe-be-integration.md` untouched

## 8. Mismatch log
Each = decided BE vs FE vs spec fix; as-built facts live in `.context/features/notifications.md`
1. **`kind=%20` & repeated `kind`:** spec said whitespace -> 400. MVC binds blank to null (= all) & keeps ONE value of repeated param. Decision: no custom binder; tests pin behavior, MAP D26 documents it (unknown non-blank values still 400)
2. **Capability premise:** "activity real with content mock" cannot occur (slices are cumulative, `parseRealSlices`). Kept explicit data-source rule `!activity && !content` (equals `!content` today), test asserts rule on raw sets
3. **Preferences data layer:** spec said TanStack Query; no feature uses `useQuery`, all settings use Zustand stores. Decision: `notification-preferences-store` (coalescing logic unit-testable without React)
4. **Unread sync rule simplified:** spec "ignore sync when `all` ready & no newer push" replaced by uniform `countSeq` rule (apply only if no local count change since request started)
5. **Per-push `commitMarkRead`** replaced by same bounded mark-all effect (one code path, same effect)
6. **Mobile nav links had no accessible name** (icons only): added `sr-only` labels so badge count is spoken as part of link name (full a11y pass stays 7.5)
7. **Capability `notificationSettings`** (`!content || activity`, rule of `muteUi`) added after review: with content real & activity mock switches would only change mock adapter. `SettingsSection.capability` stays required
8. **Mock adapter made stateful** (read marks) so syncs after mark-read/mark-all do not resurrect unread items
9. **Swagger copy:** generated from test host (SQLite) instead of running Development BE: dev DB is hosted PostgreSQL & running BE would apply migration there. Output only ADDED paths/schemas vs committed copy (265 insertions, 0 deletions)
