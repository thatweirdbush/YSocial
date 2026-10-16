---
module: FE-BE Integration Roadmap
updated: 2026-10-16
---

# FE-BE INTEGRATION ROADMAP

## Context
- **Goal:** replace FE mocks with the real BE slice by slice; contract is frozen & test-proven on BE side, never exercised from FE
- **Inputs:** `features/frontend-roadmap.md` (FE built on mocks), `backend/integration/frontend-backend-mapping.md` (MAP: contract, CP0-CP4, FE follow-ups), `backend/architecture/backend-guide.md` (BG §10: BE debt register)
- **Tier 1 doc:** single source of truth for integration phase progress (`[x]`, `[-]`, `[ ]`); FE feature roadmap stays mock-only (its "Out of scope: real API" points here)
- **Each phase MUST run full cycle:** brainstorm -> spec `ysocial-clients/web-app/docs/specs/YYYY-MM-DD-<topic>-design.md` -> `writing-plans` -> `docs/plans/` -> execute -> review -> verify (rules: `conventions/00-agentic-rules.md`)
- **Principles:**
  - **One slice at a time:** mock adapter stays default; slice goes real via `NEXT_PUBLIC_REAL_API_SLICES`, mocks removed only in Cleanup
  - **Contract first:** mismatch found -> decide BE vs FE vs MAP fix & record in the phase spec; never patch silently
  - **Evidence:** every phase closes with a manual smoke against `dotnet run` (Development seed) + FE tests

## Phases (map to MAP §6 checkpoints)

### Phase F - Foundation (CP0 + CP1, auth only)
> Spec: `ysocial-clients/web-app/docs/specs/2026-10-16-fe-be-integration-foundation-design.md` (status: draft, awaiting review)
- [ ] **F.1 API plumbing:** env config, typed `ApiError` (ProblemDetails), `api-client` rewrite (cross-tab single-flight refresh), regenerate `generated.ts`, `api:fetch` script
- [ ] **F.2 Auth slice real:** register (username) + auto-login, login, `GET me` viewer bootstrap, silent refresh, logout, forgot/reset, error-code messages (vi/en)
- [ ] **F.3 Exit:** 2-tab login -> refresh -> logout smoke on real BE, MAP §6 updated, mismatch log empty or resolved

### Phase C - Content (CP2)
- [ ] **C.1** viewer/profile header & edit (`GET users/{id}`, `by-username`, `PUT profiles/me`)
- [ ] **C.2** posts: create, edit, **delete (moved from CP1: needs real post ids)**, detail & thread (`GET threads/{id}`), profile threads tab
- [ ] **C.3** like/bookmark via idempotent PUT/DELETE (route by `kind`), saved page; stop using toggle endpoints
- [ ] **C.4** profile switcher (`PUT profiles/switch`, roadmap 2.7)

### Phase G - Graph (CP3)
- [ ] **G.1** follow/unfollow, followers/following dialog (`locked`), follow requests, privacy toggle
- [ ] **G.2** block list (D14: blocked profile = 404, drop `isBlockedBy`), close friends

### Phase N - Activity (CP4)
- [ ] **N.1** feed (`GET feed`, `forYou` anon, `following` auth)
- [ ] **N.2** mute (`PUT/DELETE mute`, `me/mutes`)
- [ ] **N.3** notifications: HTTP list/unread/read + SignalR (extend `NotificationPayload` union, map `kind`/`targetId`)

### Phase X - Cleanup
- [ ] **X.1** remove mock adapters & `ysocial_mock_user` cookie bridge for wired slices
- [ ] **X.2** remove BE toggle endpoints (BG §10 #17) after FE no longer calls them
- [ ] **X.3** update MAP FE-counterpart column & close FE follow-ups (MAP §6)

## BE track (separate, not in this roadmap's phases)
- **Gaps for FE-built features:** tabs `replies`/`media`, pin, hide-like-count, close-friends audience (D17); register: BG §10
- **Needs EF migration first:** search/tags/trending, media upload
- **No FE counterpart yet:** DMs, reposts, polls, report, onboarding, session list

## Deviations from MAP
- Post delete moves CP1 -> Phase C (no real post ids while posts are mocked); MAP §6 CP1 row updated by Phase F exit
