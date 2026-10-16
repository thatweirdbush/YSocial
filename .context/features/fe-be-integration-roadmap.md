---
module: FE-BE Integration Roadmap
updated: 2026-10-16
---

# FE-BE INTEGRATION ROADMAP

## Context
- **Goal:** replace FE mocks with real BE slice by slice; contract is frozen & test-proven on BE side, never exercised from FE
- **Inputs:** `features/frontend-roadmap.md` (FE built on mocks), `backend/integration/frontend-backend-mapping.md` (MAP: contract, CP0-CP4, FE follow-ups), `backend/architecture/backend-guide.md` (BG §10: BE debt register)
- **Tier 1 doc:** single source of truth for integration phase progress (`[x]`, `[-]`, `[ ]`); FE feature roadmap stays mock-only (its "Out of scope: real API" points here)
- **Plan docs:** ALL phases (design notes + tasks) = `ysocial-clients/web-app/docs/plans/2026-10-16-fe-be-integration.md`
- **Principles:**
  - **One slice at a time:** mock adapter stays default; slice goes real via `NEXT_PUBLIC_REAL_API_SLICES`, mocks removed only in Cleanup
  - **Contract first:** mismatch found -> decide BE vs FE vs MAP fix & record in plan Mismatch log; never patch silently
  - **Evidence:** every phase closes with manual smoke against `dotnet run` (Development seed) + FE tests

## Phases (map to MAP §6 checkpoints)

### Phase F - Foundation (CP0 + CP1, auth only)
- [ ] **F.1 API plumbing:** env config, typed `ApiError` (ProblemDetails), `api-client` rewrite (cross-tab single-flight refresh), regenerate `generated.ts`, `api:fetch` script
- [ ] **F.2 Auth slice real:** register (username) + auto-login, login, `GET me` viewer bootstrap, silent refresh, logout, forgot/reset, error-code messages (vi/en)
- [ ] **F.3 Exit:** 2-tab login -> refresh -> logout smoke on real BE, MAP §6 updated, mismatch log empty or resolved

### Phase C - Content (CP2)
- [ ] **C.1** profile header & edit, follow/unfollow (moved from G: header, hover card, `PostCard` render `followStatus`), server-side real reads for `/@username` & `/posts/[id]`
- [ ] **C.2** posts: create, edit, **delete (moved from CP1: needs real post ids)**, detail & thread (`GET threads/{id}`), profile threads tab, **feed read (moved from N: shares `post-store`)**
- [ ] **C.3** like/bookmark via idempotent PUT/DELETE (route by `kind`), saved page; stop using toggle endpoints
- Prerequisite refactor inside C: `PostRef` (kind + root post id) passed to like/bookmark/edit/delete/reply so endpoint routing never relies on hidden store lookups
- [ ] **C.4** capability map: hide BE-less features (search, tags, trending, pin, hide-like-count, multi-image, audience, `replies`/`media` tabs, new-posts pill) while content is real
- Profile switcher (FE roadmap 2.7) is NOT mock replacement: build real-first after Phase C

### Phase G - Graph (CP3)
- [ ] **G.1** followers/following dialog (`locked`), follow requests, privacy toggle
- [ ] **G.2** block list (D14: blocked profile = 404, drop `isBlockedBy`), close friends

### Phase N - Activity (CP4)
- [ ] **N.1** mute (`PUT/DELETE mute`, `me/mutes`)
- [ ] **N.2** notifications HTTP list + mark-read replacing basic inline list (filter tabs, badge, settings stay FE roadmap Phase 3)
- [ ] **N.3** SignalR push into that list (extend `NotificationPayload` union, map `kind`/`targetId`)

### Phase X - Cleanup
- [ ] **X.1** remove only mock code proven unused by wired slices & hidden features (keep slice switch, mocks for BE-less features & FE roadmap Phases 3-7, test fixtures); includes `ysocial_mock_user` cookie bridge if proven unused
- [ ] **X.2 (optional, gated on user approval)** remove BE toggle endpoints (BG §10 #17) after FE no longer calls them; closing roadmap does not depend on it
- [ ] **X.3** update MAP FE-counterpart column & close FE follow-ups (MAP §6)

## BE track (separate, not in this roadmap's phases)
- **Gaps for FE-built features:** tabs `replies`/`media`, pin, hide-like-count, close-friends audience (D17); register: BG §10
- **Needs EF migration first:** search/tags/trending, media upload
- **No FE counterpart yet:** DMs, reposts, polls, report, onboarding, session list

## Deviations from MAP
- Post delete moves CP1 -> Phase C (no real post ids while posts are mocked)
- Follow/unfollow moves CP3 -> Phase C; feed read moves CP4 -> Phase C (mock ids must not reach real routes); mute stays CP4
- Slice switch is cumulative (`auth` -> `content` -> `graph` -> `activity`)
- MAP §6 updated at each phase exit
