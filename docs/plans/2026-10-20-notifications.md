# Notifications (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans. Steps use checkbox (`- [x]`). TDD: RED -> GREEN -> refactor

**Goal:** per-kind notification list filter, bounded mark-all-read, nav unread badge, like grouping, per-kind preferences, on real BE

**Architecture:** BE adds `kind` filter (D26), `upToId` on read-all (D28), `NotificationPreferences` owned VO on `User` (D27) honored by `NotificationPublisher`. FE store becomes `byId` + per-filter lists with server-authoritative unread count, grouping is pure memoized fn

**Tech Stack:** ASP.NET Core 8 / MediatR / EF Core (SQLite tests) | Next.js 16 / Zustand / TanStack Query / Vitest

**Spec:** `docs/specs/2026-10-20-notifications-design.md` (rev 2). Paths: BE repo-relative; FE relative to `ysocial-clients/web-app/`

## Global Constraints
- C# conventions: CRLF, file-scoped namespaces, `#region`, sorted usings, short English names; rules `IClassifiedRule`; no new error codes (`CodesSnapshot_MatchesApprovedList` stays green)
- Request bool fields `bool?` + `NotNull` validator; every endpoint `[ProducesResponseType]`
- FE: no `any`, no inline CSS, Lucide only, `import type`, flat i18n keys `domain.name`, i18n vi + en both; animate transform/opacity only; no `hover:scale-*`
- Generated files (`swagger.json`, `generated.ts`) never hand-edited: `npm run api:fetch` (BE running) -> `api:generate` -> `api:check`
- Commits: conventional, author = user, NO `Co-Authored-By`
- Contract first: Task B4 (MAP) before any FE task

## Review Focus
- Count races: push during page load / unread-count / mark-all (never overwrite newer push)
- `read-all` must never mark rows newer than watermark
- Preference default `true` for existing rows; missing PUT field must 400
- StrictMode double effect must not lose "fresh" highlights
- Capability: Mentions never shown when `activity` is real

## File map
BE: `Domain/Notifications/NotificationKind.cs` (new), `Domain/Users/NotificationPreferences.cs` (new), `Domain/Users/User.cs`, `Infrastructure/.../UserConfiguration.cs` + migration, `Application/Features/Notifications/{GetNotifications,MarkAllNotificationsAsRead,GetNotificationPreferences,UpdateNotificationPreferences}`, `NotificationPublisher.cs`, `Application/Models/NotificationDtos.cs`, `Api/Controllers/NotificationsController.cs`, tests in `tests/YSocial.Api.IntegrationTests/Notifications/`, `tests/YSocial.Domain.UnitTests`.
FE: `features/notifications/{types,services,store,components,mocks}`, `lib/capabilities.ts`, `components/layout/main-layout.tsx`, `features/settings/*`, `app/settings/(sections)/notifications/page.tsx`, `lib/locales/{vi,en}.json`.

---

## Part 1 - Backend

### Task B1: `kind` filter (D26)
**Files:** `src/YSocial.Domain/Notifications/NotificationKind.cs`, `GetNotifications.cs`, `NotificationsController.cs`, `tests/.../Notifications/NotificationKindFilterTests.cs`
- [x] RED: integration tests (arrange like + comment + follow for test_user): `?kind=like` returns only `NewLike` with `totalCount` 1 & `unreadCount` OVERALL (3); `kind=reply`, `kind=follow` (all 3 follow types); absent = all; `kind=` = all; `kind=LIKE` ok; `kind=mention` / `kind=%20` -> 400 `ValidationFailed` + `errors.kind`; repeated `kind=like&kind=reply` -> assert observed status (document); paging `pageSize=1&kind=follow` hasNextPage correct
- [x] Run, confirm FAIL
- [x] Domain: `NotificationKind` static class: `Like="like"`, `Reply="reply"`, `Follow="follow"`, `bool TryParse(string?, out string kind)` (case-insens.), `string Of(NotificationType)`, `IReadOnlySet<NotificationType> TypesOf(kind)`; unit test mapping of all 5 types (`tests/YSocial.Domain.UnitTests`)
- [x] `GetNotificationsQuery(int Page = 1, int PageSize = 20, string? Kind = null)`; validator: `Kind` null/empty ok else `NotificationKind.TryParse`; message "Kind must be 'like', 'reply' or 'follow'."
- [x] Handler: filter `visible` by kind before `Slice`; `totalCount` = filtered count; `unreadCount` from unfiltered `visible`
- [x] Controller: `[FromQuery] string? kind = null`, add 400 already declared
- [x] Run `dotnet test`, GREEN. Verify `Swagger_*` tests (regen later in B4)

### Task B2: bounded read-all (D28)
**Files:** `MarkAllNotificationsAsRead.cs`, controller, `tests/.../Notifications/NotificationTests.cs` (new region)
- [x] RED tests: with 3 notifications (A oldest, B, C newest), `PUT read-all?upToId=B` -> A,B read, C unread, `unreadCount` 1; no param = all read; `upToId=C` all read; unknown guid -> 404; id of another user's notification -> 403 `NotNotificationRecipient`; id of notification whose sender was blocked after -> still 204 (lookup skips access filter); idempotent twice; unauthenticated 401
- [x] `MarkAllNotificationsAsReadCommand(Guid? UpToId = null)`; handler: if `UpToId` set -> `notificationRepository.GetByIdAsync(new NotificationId(..))` null -> `Result.NotFound`; `RecipientId != viewer` -> `Result.Forbidden(msg, ErrorCodes.NotNotificationRecipient)`; mark loaded accessible unread rows where `CreatedAt <= watermark.CreatedAt` (include `<=` ties). Reuse same approach as `MarkNotificationAsRead` for codes (read it first)
- [x] Controller `[FromQuery] Guid? upToId`; add 403/404 `ProducesResponseType`
- [x] GREEN

### Task B3: preferences (D27)
**Files:** `Domain/Users/NotificationPreferences.cs`, `User.cs`, `UserConfiguration.cs`, migration `AddNotificationPreferences`, `NotificationDtos.cs`, `Features/Notifications/{GetNotificationPreferences,UpdateNotificationPreferences}/*.cs`, `NotificationPublisher.cs`, controller, tests
- [x] RED integration tests: GET defaults all `true`; PUT `{likes:false,replies:true,follows:true}` -> 200 DTO, GET reflects; PUT missing field -> 400 `ValidationFailed` & stored value unchanged; 401 anonymous; preferences are per profile (switch profile keeps own); publisher: likes off -> `PUT /posts/{id}/like` by demo creates NO row & NO outbox (`Store.Notifications`, `Store.Messages` empty) but comment still notifies; comment-like with likes off also skipped; replies off skips `NewComment`; follows off skips `NewFollow`, `FollowRequested`, `FollowAccepted`; turning back on does not backfill; deleted/missing recipient -> skip no throw
- [x] Domain unit test: `NotificationPreferences.Default()` all true; `Allows(NotificationType)` per mapping (uses `NotificationKind`)
- [x] Implement VO `NotificationPreferences : ValueObject` (pattern of `PrivacySettings`: private ctor, public ctor `(bool likes, bool replies, bool follows)`, `Default()`, `Allows`); `User.NotificationPreferences` (default in ctor) + `UpdateNotificationPreferences(...)`
- [x] `UserConfiguration`: `OwnsOne` inline columns, `Navigation(...).IsRequired()`
- [x] Migration: `dotnet dotnet-ef migrations add AddNotificationPreferences -p src/YSocial.Infrastructure -s src/YSocial.Api -o Persistence/Migrations`; EDIT generated columns to `defaultValue: true` (non-null bool defaults to false otherwise); run `ModelTests.Model_MatchesLatestMigrationSnapshot`, `SeederTests`
- [x] DTO `NotificationPreferencesDto(bool Likes, bool Replies, bool Follows)`; `GetNotificationPreferencesQuery`; `UpdateNotificationPreferencesCommand(bool? Likes, bool? Replies, bool? Follows) : ResultCommand<NotificationPreferencesDto>` + validator `NotNull` x3 (401 when no viewer)
- [x] `NotificationPublisher`: inject `IUserRepository`; after self check load recipient; null/deleted or `!recipient.NotificationPreferences.Allows(type)` -> return before `Notification.Create`
- [x] Controller `GET/PUT preferences` (declared before `{id:guid}` routes irrelevant; attribute route `preferences`), typed responses
- [x] GREEN full `dotnet test` (report counts)

### Task B4: contract (MAP + swagger)  [BLOCKS FE]
- [x] MAP §2.7 (endpoint rows: list `kind`, read-all `upToId`, preferences GET/PUT), §3 (`NotificationPreferencesDto`), §1 note on `kind` validation table (incl. observed repeated-param result), §7 add D26, D27, D28 (rationale: spec §2)
- [x] Update `Swagger_*` contract tests if they pin operations; run
- [x] With BE running: `npm run api:fetch`, `npm run api:generate`, `npm run api:check`
- [x] Record any mismatch in spec §8

---

## Part 2 - Frontend (all in `ysocial-clients/web-app/`)

### Task F1: types, services, mock seed, capability
**Files:** `features/notifications/types/index.ts`, `services/notification-service.ts` (+test), `mocks/notification-seed.ts`, `lib/capabilities.ts` (+test), `components/notification-item.tsx`, locales
- [x] RED: service tests: real `fetchNotifications(page, filter)` sends `kind` for like/reply/follow, none for `all`, returns empty page (no request) for `mentions` in real mode; mock filters seed by kind (mentions included); `markAllNotificationsRead(upToId?)` sends `?upToId=`; `getNotificationPreferences/updateNotificationPreferences` real + mock in-memory; capability test: `mentionNotifications` true only when `activity` & `content` mock
- [x] Types: `NotificationFilter = "all"|"mentions"|"replies"|"follows"|"likes"`, `NotificationKind` += `mention`, `NotificationPreferences { likes, replies, follows }` (+ DTO alias)
- [x] Seed: convert every `createdAt` to ISO (offsets from module-load `now`), add 2 mention items (sender mock users); `formatTime` in `notification-item.tsx`: drop display-text branch (ISO only)
- [x] Capability `mentionNotifications` (rule in spec §2.4)
- [x] GREEN, typecheck

### Task F2: store refactor (spec §4.1-4.3)
**Files:** `store/notification-store.ts` (+ rewrite test)
- [x] RED tests (list in spec §6 "FE store"): filters lazy load; push routing & `byId` dedupe; mark-read cross-list; reset drops in-flight; push during page-1 load keeps count; push during `unread-count`; refresh vs push; mark-all watermark (items newer untouched), duplicate call collapses, failure reverts only flipped ids + resync, success resync; near-tie watermark (same `createdAt`); `dropNotificationsFrom` then sync; single mark-read optimistic -1 / rollback
- [x] Implement: `byId`, `lists`, `unreadCount`, `pushSeq`, `generation`; exports keep names + `filter` param; add `syncUnreadCount()`, `markAllReadUpTo` (single-flight promise); remove `before.unreadCount` restore
- [x] GREEN

### Task F3: live sync restructure
**Files:** `components/notification-live-sync.tsx` (+test)
- [x] RED: count sync runs for signed-in viewer in mock & real; hub only real; resume -> refresh loaded lists or sync when `all` not ready; block & unblock -> purge/sync; logout resets in both modes
- [x] Implement; GREEN

### Task F4: grouping + tabs
**Files:** `services/group-notifications.ts` (+test), `components/notification-list.tsx`, `notification-item.tsx`/new `notification-group-item.tsx`, `notification-container.tsx`, locales
- [x] RED `groupNotifications`: window edge (23h59 vs 24h01 from newest member), different posts never merge, group id = newest member, unread if any, avatars <= 3, count = loaded members, non-likes untouched, regroup after appended older page & prepended push
- [x] Implement pure fn + `useMemo` in list; group row text `notifications.groupedLike` / `groupedLikeOne` ("{name} & {count} others liked" / EN singular); opening group marks all members read
- [x] Tabs: controlled `Tabs` -> store filter; Mentions tab only if `hasCapability("mentionNotifications")`; per-tab skeleton, error/retry, EmptyState keys; `grid-cols-*` adapts to tab count
- [x] Component tests; GREEN

### Task F5: badge + mark-on-view
**Files:** `components/notification-nav-badge.tsx` (+test), `index.ts`, `main-layout.tsx` (3 nav renders), `notification-container.tsx` (+test)
- [x] RED: badge hidden at 0/guest, `99+` cap, `aria-label` includes count (link label), no layout shift (absolute); container: auto mark-all only when visible+ready+unread>0 using newest id; hidden tab -> no call, visible event -> call; StrictMode double mount calls once & keeps fresh highlights; push while visible -> `commitMarkRead`; manual button shares in-flight promise
- [x] Implement; export `NotificationNavBadge`; GREEN

### Task F6: settings section
**Files:** `features/settings/components/notifications-settings.tsx` (+test), `constants.ts`, `index.ts`, `app/settings/(sections)/notifications/page.tsx`, `settings-routes.test.tsx`, locales
- [x] RED: skeleton until loaded; GET error -> retry; toggles disabled before load; optimistic toggle; coalescing (A off, A on, B off, first PUT fails -> final state = last confirmed or newer desired, no stale overwrite); `cancelQueries` before optimistic write; labels incl. "replies to your posts"
- [x] Implement with TanStack Query (match `PrivacySection` fetch pattern); page with `noindex` metadata; section entry (Bell icon)
- [x] GREEN

### Task F7: verify & exit
- [x] `npm run test`, `typecheck`, `lint` (exact results); `dotnet test` (exact counts)
- [x] Real-BE smoke (done: API script vs PostgreSQL + browser at desktop dark & 375px dark; NOT covered: light theme, 768 & 1440px, keyboard pass) (BE + `npm run dev`): like/comment/follow from seed users -> tabs filter + paging, badge live, mark-on-view bounded, preference off stops new notifications; mock mode (`NEXT_PUBLIC_REAL_API_SLICES=none`): Mentions tab, grouping; 375/768/1440 px, light/dark, keyboard focus
- [x] Docs (same task): `.context/features/notifications.md` (new) + INDEX entry; BG §7.5 & §11 counts; DM §2; `backend-unit-test.md`; roadmap ticks (3.1, 3.2, 3.4 `[x]`, 3.3 closed rationale); spec §8 mismatch log; this plan checkboxes
- [x] Deferred-minor triage (00-agentic-rules 4.3), report: resolved MAP unread-count row, `notificationSettings` capability, mention icon colour; deferred real-BE smoke, "N others" BE aggregation, mention model, reply preview, inactive-tab `aria-controls` (7.5)

## Mismatch log
See spec §8
