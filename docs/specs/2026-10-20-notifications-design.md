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

Out of scope: mention notifications on BE (no mention model, BG §9), BE-side grouping/aggregation, push preview text, batch mark-read endpoint.

## 2. Contract delta (MAP update BEFORE FE tasks)

### 2.1 D26: kind filter on list
- `GET /api/notifications?kind=like|reply|follow&page&pageSize`
- Order: access filter -> kind filter -> count -> page. `totalCount`/`hasNextPage` follow the filtered list
- `unreadCount` stays OVERALL (not per kind): badge never changes when the tab changes
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
  - Missing field -> 400 `ValidationFailed` (plain `bool` would bind to `false` and silence notifications the user never touched)
- `[Authorize]` (controller-level); route does not clash with `{id:guid}`
- Type semantics (explicit):
  - `likes` = `NewLike`: covers likes on posts AND on replies (comment like notifies the comment author, `targetId` = root post)
  - `replies` = `NewComment`: notifies the POST author only; a reply to your reply notifies nobody today -> UI label "replies to your posts"
  - `follows` = `NewFollow`, `FollowRequested`, `FollowAccepted` (follow-requests banner still lists pending requests)
- Preference off -> `NotificationPublisher` skips like self notifications: NO row, NO outbox push. Turning back on does not backfill
- Storage: owned value object `NotificationPreferences { Likes, Replies, Follows }` on `User` (per profile, inline columns like `PrivacySettings`). Migration MUST default existing rows to `true`

### 2.3 D28: bounded mark-all-read
- `PUT /api/notifications/read-all?upToId=<guid>` (param optional; absent = today's behavior)
- Server loads that notification and marks own unread rows with `CreatedAt <= its CreatedAt`; later rows stay unread (prevents marking unseen arrivals as read)
- Id, not timestamp: JS `Date` has ms, Postgres microseconds -> a timestamp watermark could exclude the newest item; an id can only err toward "left unread" (safe)
- Unknown id -> 404; foreign id -> 403 `NotNotificationRecipient` (same as `PUT {id}/read`); lookup skips the access filter (sender may have been blocked after page load). 204 on success, idempotent

### 2.4 Capability table
- `mentionNotifications: (s) => !s.has("activity") && !s.has("content")`: ON only when the data source can produce mentions (mock seed is used only when BOTH slices are mock; `activity` real reads the BE list, so `unlessContentReal` would show an always-empty tab). Add to capability tests
- Real mode never sends `kind=mention` (BE would 400): service returns an empty page. `NotificationKind` gains `mention` (mock only; mapper unchanged)

## 3. BE design
- `GetNotificationsQuery(Page, PageSize, Kind?)`; Kind->type set lives next to `NotificationType` (domain); handler filters `visible` before slicing; `unreadCount` from unfiltered `visible`
- `MarkAllNotificationsAsReadCommand(UpToId?)`; unbounded path unchanged
- Prefs: `User.UpdateNotificationPreferences(...)`, `GetNotificationPreferences` query, `UpdateNotificationPreferences` command
- `NotificationPublisher`: load recipient via `IUserRepository`, check preference of the type's kind, return before `Notification.Create` when off; recipient missing/deleted -> skip, no throw
- Migration `AddNotificationPreferences` (default true); `ModelTests` snapshot, `SeederTests` green

## 4. FE design

### 4.1 Store
- State: normalized `byId` + `lists: Record<Filter, { ids, nextPage, status, loadingMore }>`, `Filter = all | mentions | replies | follows | likes`; global `unreadCount`
- Existing exports keep names, gain optional `filter` (default `all`); `refreshNotifications` refreshes only loaded lists; reset bumps `generation` and clears all
- Push dedup against `byId` (not one list); prepends to `all` + its kind list only when loaded
- Tab switch loads lazily (size-matched skeleton); per-list error + retry

### 4.2 Unread count: server authoritative (fixes existing races)
- Client changes the count in exactly 2 ways: optimistic -1 on single mark-read, +1 on an accepted push. Never recount from loaded items
- `pushSeq` increments on every accepted push. A count from a response that STARTED before the latest push is not applied (page 1, refresh, `unread-count`); items still merge, then `syncUnreadCount()` is re-issued once. (Fixes current `loadNotifications`/`refreshNotifications` overwriting a push's +1)
- `syncUnreadCount()` (generation-guarded): on mount for any signed-in viewer (both modes), on resume while `all` not ready, after mark-all (success or failure), after block purge AND after unblock (LiveSync relation subscription). Ignored while `all` is ready only when no newer push (page count is authoritative otherwise)
- Block: `dropNotificationsFrom` purges locally for instant UI, then `syncUnreadCount()` (unloaded items of that sender are still in the count until server answers)
- Reset on logout in both modes (LiveSync restructured: hub stays real-only, count sync does not)

### 4.3 Mark-all-read (bounded, single flight)
- Watermark = newest item id of `all`. Optimistic flip touches only items at or older than it; later pushes stay unread
- One mark-all in flight at a time: auto trigger and manual button share the same promise (duplicate calls collapse)
- Failure: revert ONLY the ids this call flipped, then `syncUnreadCount()`; NEVER restore a snapshotted count (current code wipes concurrent push +1). Success: `syncUnreadCount()` too (server also marked unloaded older pages). Generation reset drops both paths
- Auto trigger (mark-on-view) only when: route mounted, `document.visibilityState === "visible"`, `all` ready, unread > 0. While hidden, pushes stay unread; on visible again, run again with a fresh watermark
- "Fresh" highlight: unread ids snapshotted ONCE per visit into local state (survives the flip). StrictMode dev double-effect must not re-snapshot from an already-flipped list (guard + test). Pushes arriving while visible -> `commitMarkRead(id)`
- Navigating away mid-request: the request completes (store is global), no UI effect; reset (logout/switch) discards

### 4.4 Tabs & grouping
- Tabs: All / Mentions (capability) / Replies / Follows / Likes; tab = server filter => correct paging per tab
- `groupNotifications(items)`: pure, memoized from current lists (never stored) => regroups after pagination and pushes
  - Likes only; key = `postId`; 24h window from the group's NEWEST member; walk newest-first, add a like to the open group if within window, else open a new group; group id = newest member id; group sits at newest member; unread if any member unread; up to 3 stacked avatars
  - N = exact number of LOADED members (never post `likesCount`); wording "X and N others liked", never implying unseen totals; i18n keys `notifications.groupedLike` / `groupedLikeOne` (params `{name}`, `{count}`)
  - Opening a group marks all its unread members read
  - Known limit: older unloaded pages only extend tail groups when loaded
- PREREQ: mock seed `createdAt` is display text ("10m ago"); window logic and "newest" need parseable dates -> convert seed to ISO (relative to `now` at module load) and keep display formatting in `notification-item` `formatTime` only (drop the "already display text" branch)

### 4.5 Badge
- `NotificationNavBadge` (feature `index.ts`) in the 3 nav renders of `main-layout.tsx`: numeric pill, `99+` cap, accent token, absolutely positioned (no layout shift), link `aria-label` includes count; hidden for guest

### 4.6 Settings (3.4)
- `src/app/settings/(sections)/notifications/page.tsx` thin, `noindex`; `NotificationsSection` in `features/settings`; entry in `SETTINGS_SECTIONS`
- Data: TanStack Query. Skeleton until GET succeeds; GET error -> retry; NO toggles before load
- Coalescing, latest wins: at most 1 PUT in flight; toggles meanwhile update desired state + dirty flag; on settle, if dirty send the FULL desired object. `cancelQueries` before each optimistic write (late GET cannot overwrite). Keep last server-confirmed value; on error revert to it only if no newer change is pending, toast. No invalidate while anything pending
- Decision: prefs are server state => NOT in the future localStorage `settings-store` (4.2)

## 5. Edge cases
- Block: purge from `byId` + all lists, resync count (§4.2)
- Push of a kind whose list is not loaded: `byId`/`all` only; count +1
- Guest: no request, empty lists, badge hidden
- Prefs off while a push is in flight: already enqueued -> delivered once (accepted)
- Account switch: reset drops in-flight responses (generation guard)
- Push arrives during `read-all`: stays unread (above watermark), count re-synced after

## 6. Tests (RED first)
- BE: kind filter (each kind, absent, empty, invalid, case, repeated param, `unreadCount` overall, paging counts); `upToId` (older marked, newer untouched, unknown 404, foreign 403, absent = all); prefs GET default, PUT replace, missing field 400, 401; publisher skips per kind (post-like and reply-like both covered by `likes`) and still notifies others; migration default true; Swagger contract tests
- FE store: filters, push routing, mark-read cross-list, reset, push during page load (count not overwritten), push during `unread-count`, mark-all failure with concurrent push (count intact), duplicate mark-all collapses, near-tie watermark, block + unblock resync
- FE UI: tabs, `groupNotifications` (window edges, regroup after page/push), badge (cap, aria), mark-on-view (hidden tab, StrictMode double effect, fresh highlight), capability (`activity` real + content mock => no Mentions), settings (A off, A on, B off with first PUT failing; no toggle before load)

## 7. Exit docs
- MAP §2.7/§3/§7 (D26, D27, D28) first; BG §7.5/§11; DM §2; `backend-unit-test.md`; new `.context/features/notifications.md` + INDEX entry; roadmap ticks (3.3 closed with rationale); `fe-be-integration.md` untouched

## 8. Mismatch log
Each = decided BE vs FE vs spec fix; as-built facts live in `.context/features/notifications.md`
1. **`kind=%20` & repeated `kind`:** spec said whitespace -> 400. MVC binds blank to null (= all) & keeps ONE value of a repeated param. Decision: no custom binder; tests pin the behavior, MAP D26 documents it (unknown non-blank values still 400)
2. **Capability premise:** "activity real with content mock" cannot occur (slices are cumulative, `parseRealSlices`). Kept the explicit data-source rule `!activity && !content` (equals `!content` today), test asserts the rule on raw sets
3. **Preferences data layer:** spec said TanStack Query; no feature uses `useQuery`, all settings use Zustand stores. Decision: `notification-preferences-store` (coalescing logic unit-testable without React)
4. **Unread sync rule simplified:** spec "ignore sync when `all` ready and no newer push" replaced by the uniform `countSeq` rule (apply only if no local count change since the request started)
5. **Per-push `commitMarkRead`** replaced by the same bounded mark-all effect (one code path, same effect)
6. **Mobile nav links had no accessible name** (icons only): added `sr-only` labels so the badge count is spoken as part of the link name (full a11y pass stays 7.5)
7. **Capability `notificationSettings`** (`!content || activity`, rule of `muteUi`) added after review: with content real & activity mock the switches would only change the mock adapter. `SettingsSection.capability` stays required
8. **Mock adapter made stateful** (read marks) so syncs after mark-read/mark-all do not resurrect unread items
9. **Swagger copy:** generated from the test host (SQLite) instead of a running Development BE: the dev DB is a hosted PostgreSQL & running the BE would apply the migration there. Output only ADDED paths/schemas vs the committed copy (265 insertions, 0 deletions)
