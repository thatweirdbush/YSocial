# Discovery - implementation plan

Spec: `docs/specs/2026-10-21-discovery-design.md`. Order: BE (domain -> infra -> app/API + tests) -> swagger -> FE. TDD per task; commit per task (author = user, no trailers).

## Tasks
- [x] **B1 Domain:** `HashtagParser` + `Post.Hashtags` (create & edit) - tests first (parity table)
- [x] **B2 Infra:** `PostHashtag` owned config, migration `AddPostHashtags`, repo members, `Store` helpers, model snapshot test
- [x] **B3 Trending + tag posts:** queries, validators, `TrendingController`, `TagsController`, integration tests
- [x] **B4 Suggestions:** `IUserRepository.GetAllActiveAsync`, query, `GET users/suggestions`, tests
- [x] **B5 Seed:** drop stock URLs, stage 2 discovery, seeder tests
- [x] **B6 Contract docs:** MAP §1.1/§2/§3/§7 (D31 D32), swagger copy (`api:fetch`, `api:generate`, `api:check`)
- [x] **B7 FE:** real adapters, capabilities, tests, real-BE browser smoke
- [x] **B8 As-built:** `.context` docs (BG, DM, MAP, features/discovery.md, roadmap, INDEX), deferred triage

## Mismatch log
- Spec said hashtag rows auto-included only in discovery queries: modeled as regular child entity (`HasMany`), because EF always auto-includes owned types
- `ModelTests` FK guard widened to allow `Post -> PostHashtag` (aggregate -> own children)
- Swagger copy exported through opt-in test (`YSOCIAL_EXPORT_SWAGGER`) instead of `api:fetch`, so no real DB was needed
- Korean syllables fold to decomposed jamo in both JS & C# (fixture pins it)
- PostgreSQL opt-in suite written, not run (no local PostgreSQL/Docker); manual real-DB smoke recorded in `features/discovery.md`
