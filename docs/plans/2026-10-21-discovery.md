# Discovery - implementation plan

Spec: `docs/specs/2026-10-21-discovery-design.md`. Order: BE (domain -> infra -> app/API + tests) -> swagger -> FE. TDD per task; commit per task (author = user, no trailers).

## Tasks
- [ ] **B1 Domain:** `HashtagParser` + `Post.Hashtags` (create & edit) - tests first (parity table)
- [ ] **B2 Infra:** `PostHashtag` owned config, migration `AddPostHashtags`, repo members, `Store` helpers, model snapshot test
- [ ] **B3 Trending + tag posts:** queries, validators, `TrendingController`, `TagsController`, integration tests
- [ ] **B4 Suggestions:** `IUserRepository.GetAllActiveAsync`, query, `GET users/suggestions`, tests
- [ ] **B5 Seed:** drop stock URLs, stage 2 discovery, seeder tests
- [ ] **B6 Contract docs:** MAP §1.1/§2/§3/§7 (D31 D32), swagger copy (`api:fetch`, `api:generate`, `api:check`)
- [ ] **B7 FE:** real adapters, capabilities, tests, real-BE browser smoke
- [ ] **B8 As-built:** `.context` docs (BG, DM, MAP, features/discovery.md, roadmap, INDEX), deferred triage

## Mismatch log
(empty)
