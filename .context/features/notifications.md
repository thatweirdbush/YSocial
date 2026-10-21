---
module: Notifications (FE + BE) - roadmap Phase 3
updated: 2026-10-20
spec: docs/specs/2026-10-20-notifications-design.md
plan: docs/plans/2026-10-20-notifications.md
---

# Notifications

List with per-kind tabs, like grouping, bounded mark-all-read, nav unread badge, per-kind preferences. Real BE by default (slice `activity`); mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`) serves stateful seed. Contract: MAP §2.7 (D26 filter, D27 preferences, D28 bounded read-all). Push pipeline: BG §7.5; transport & block purge: `backend/integration/fe-be-integration.md` (Phase N)

## Data flow
```
SignalR ReceiveNotification -> NotificationLiveSync -> pushNotification
GET /api/notifications?kind -> notification-service -> notification-store (byId + lists[filter])
NotificationContainer (tabs, mark-on-view) | NotificationNavBadge (unread) | NotificationSettings (preferences)
```
- **Store** (`store/notification-store.ts`): `byId` (1 record per notification) + `lists: Record<NotificationFilter, {ids, nextPage, status, loadingMore}>` (`all|mentions|replies|follows|likes`) + `unreadCount`. Items shared by lists, so reading in 1 tab reads everywhere. Hooks: `useNotificationItems(filter)`, `useNotificationList(filter)`, `useUnreadCount()`
- **Preferences store** (`store/notification-preferences-store.ts`): server state in Zustand, NOT in localStorage `settings-store` (per device, `features/settings.md`). Reset together with notification store (logout, account switch)
- **Service** (`services/notification-service.ts`): real adapter + stateful mock adapter (read marks, preferences; `resetMockNotificationState()` for tests)

## BE contract used
| FE call | Endpoint | Notes |
|---|---|---|
| `fetchNotifications(page, filter)` | `GET /api/notifications?page&pageSize=20&kind` | `likes`->`like`, `replies`->`reply`, `follows`->`follow`, `all` sends none; `mentions` never reaches BE (400): empty page |
| `fetchUnreadCount` | `GET .../unread-count` | overall, same sender filter as list |
| `markNotificationRead(id)` | `PUT .../{id}/read` | idempotent |
| `markAllNotificationsRead(upToId)` | `PUT .../read-all?upToId` | bounded (D28); mock ids never sent |
| `fetchNotificationPreferences` / `saveNotificationPreferences` | `GET/PUT .../preferences` | PUT = full object, all fields required |

## Key rules
- **Kinds:** `likes` = `NewLike` (posts & replies), `replies` = `NewComment` (post author only; a reply to a reply notifies nobody today), `follows` = `NewFollow`, `FollowRequested`, `FollowAccepted`. Preference off = no row & no push from then on, no backfill when re-enabled (earlier rows stay)
- **Unread count: server authoritative.** Client changes it only by -1 (single mark-read) & +1 (push), each bumping `countSeq`. Server count whose request started before local change is NEVER applied (`syncUnreadCount` asks once more, 2nd stale answer is dropped). Page counts follow same rule; `mentions` pages never carry count. Never recounted from loaded items
- **`syncUnreadCount` triggers:** mount of signed-in viewer (both modes, so badge works before page is opened), resume with no list loaded, after mark-all (success or failure), after block (`dropNotificationsFrom` purges locally first, once for several ids) & unblock, after stale page count
- **Mark all (D28):** bound = newest LOADED notification (`createdAt` max over `byId`), flips only loaded unread items `<=` bound (ties included, same as BE), one request at a time (callers share promise). Failure reverts ONLY ids this call flipped & re-syncs (no snapshot count restore). Success re-syncs (BE also marked unloaded older rows). Reset drops both outcomes
- **Mark-on-view (X model):** page mounted + signed in + `all` list ready + tab visible + loaded unread > 0 -> mark all (bounded). Hidden tab keeps pushes unread; `visibilitychange` re-runs with fresh bound. Push that lands while page is open is picked up by same effect (after in-flight request settles). Failure does not loop (button stays for manual retry)
- **Fresh highlight:** unread ids seen on page stay highlighted (dot + background) after they are marked read. Set is grown WHILE RENDERING (React "adjust state on render", lint rule `set-state-in-effect`), so StrictMode double render/effect cannot lose it. Resets with page visit
- **Like grouping** (`services/group-notifications.ts`, pure, memoized per render from current items): likes of 1 post inside 24h of group's NEWEST member (anchored, not chained); group sits at its newest member, key `like:<newestId>`; unread if any member is; max 3 avatars; opening group marks every unread member. "X and N others": N = LOADED members only (never post `likesCount`, never implies unseen likes). Replies/follows/mentions never group
- **Tabs = server filters:** each tab has its own list & paging. Push goes to `all` + its kind list only when those lists are loaded (`ready|loading`). `mentions` tab only when capability `mentionNotifications` (`!activity && !content`: seed is only source)
- **Preferences edits:** no switch before first load (skeleton; error + retry). Optimistic on `desired`, `confirmed` = last server value. 1 save in flight; toggles meanwhile move `desired` only & follow-up sends newest full object. Failure reverts to `confirmed` only when nothing newer is pending (A off, A on, B off with 1st save failing ends on latest choices)
- **Capabilities:** `mentionNotifications` (`!activity && !content`), `notificationSettings` (`!content || activity`, same rule as `muteUi`: with content real & activity mock switches would only change mock adapter, so section shows "unavailable")
- **A11y:** badge pill is `aria-hidden` + `sr-only` count text inside link name; mobile nav links got `sr-only` labels (icon-only before); unread dot is `role="img"` labelled "Chua doc"

## Design decisions
- **Likes ungrouped across posts, 24h window** (not "no window"): old likes would otherwise glue to fresh group forever
- **Bounded read-all by id** (not timestamp): JS `Date` has ms, Postgres microseconds, timestamp bound could skip newest row; id can only err toward "left unread"
- **Preferences = Zustand store, not TanStack Query:** no feature uses `useQuery` (providers only); every settings section uses stores + `commit*` functions
- **Mock adapter is stateful** (read marks): static seed would reset count on every sync
- **3.3 simulated realtime closed:** real SignalR push exists (`NotificationLiveSync`); no mock timer
- **Auto mark-all replaces per-push `commitMarkRead`** (spec §4.3 said per-id): same net effect, one code path

## Pitfalls
- **`kind=%20` & repeated `kind`:** MVC binds blank to null (= all) & keeps ONE value of repeated param: neither is 400. Pinned by `NotificationKindFilterTests`, noted in MAP
- **Slices are cumulative** (`parseRealSlices`): "activity real with content mock" cannot occur, so `mentionNotifications` equals `!content` today; rule still names its data source
- **Existing bug fixed:** old `commitMarkAllRead` restored snapshot `unreadCount` on failure (wiped pushes during request); old page loads overwrote count (lost/duplicated push +1)
- Never call mark-all without loaded list in real mode: no bound = nothing to mark (no request)

## Open
- BE aggregation for grouping ("N others" over unloaded pages), mention notifications, reply preview text (BG §10)
- Smoke (real BE on hosted PostgreSQL, migration `AddNotificationPreferences` applied, existing rows read `true`): kind filter, bounded read-all (older read, newer unread, 403/404), preferences stop & resume notifications, live push + badge, fresh highlight, grouping, settings persist; UI at desktop dark & 375px dark. NOT covered: light theme, 768/1440px, keyboard pass (7.5)
- Pitfall: full page navigation right after switch toggle aborts in-flight save (client navigation keeps store, so no loss)
