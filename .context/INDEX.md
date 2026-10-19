# Project Knowledge Index

## Conventions (`.context/conventions/`)
- [Agentic Rules & Workflows](conventions/00-agentic-rules.md) - Persona, Superpowers workflows, Task Closure protocol, Systematic Debugging (Rule of Two Failures), architecture guardrails
- [Document Standards](conventions/01-doc-standards.md) - Token optimization rules, ASCII syntax, concise style, no emojis
- [BE Conventions](conventions/backend.md) - C# .NET 8 DDD, CQRS (MediatR), StronglyTypedIds, classified rules & Result codes, viewer access policy (read gate) & InteractionGuard (write gate), projectors, set-based repo members, pagination & relation-search rules
- [FE Conventions](conventions/frontend.md) - Next.js 15 App Router, React Server vs Client Components, Tailwind CSS, TypeScript guidelines, API integration patterns

## Feature Specs (`.context/features/`)
- [Identities Spec](features/identities.md) - Design decisions: registration (username), JWT + rotating profile-bound refresh tokens, session cap eviction, OTP password reset; endpoints in FE-BE Mapping
- [Post Creator Spec](features/post-creator.md) - Dynamic post creation engine, Zustand draft persistence, Radix UI popovers, memory-safe media upload previews (`URL.revokeObjectURL`), multi-tier Escape key shield logic
- [User Profile & Relations Spec](features/user-profile-and-relations.md) - Profile UI (SSR/CSR), relation design decisions (follow states, close friends, soft-delete restore, total blocks D14, follow requests), safety guards; endpoints in FE-BE Mapping
- [FE Roadmap](features/frontend-roadmap.md) - FE audit (2026-10-01) & prioritized 8-phase checklist (Foundation -> Post Detail -> Search -> Social graph -> Notifications -> Settings -> DMs -> Engagement -> Polish), mock data ONLY, no BE
- [Post Detail Spec](features/post-detail.md) - `/posts/[id]` thread + 1-level replies, mock `post-service` + normalized Zustand `post-store` (like/bookmark/reply sync), Vitest/RTL setup, design decisions & pitfalls
- [Search & Tags Spec](features/search.md) - `/search` explore + Top/Users/Posts/Hashtag tabs, ARIA combobox suggestions, persisted recent searches, `/tags/[tag]`, linkified `#tag`/`@mention`, mock `user-service` + `user-store` (follow sync), diacritics-insensitive matching
- [Feed & Post Interaction Spec](features/feed-post-interaction.md) - "N bài mới" pill (simulated push stream, per-tab consumed buffer), owner actions (edit/delete/pin/hide likes, service-enforced ownership, field-scoped rollback, tombstones), author hover card, viewer-scoped follow graph & `user-store`, shared `src/mocks/` seeds
- [Profile Core Spec](features/profile.md) - `/@username` on mocks: server-resolved route + real 404 (session cookie bridge), SSR-safe auth hydration, viewer/actor identity split, graph-derived counts & fans, profile tab controller, followers dialog, share link + QR
- [Relationship Controls Spec](features/relationship-controls.md) - private account & follow requests, close friends, block / mute on mocks: relation-graph + visibility contract, op-ledger ordering, viewer-switch invalidation, `/settings` shell
- [FE-BE Integration Roadmap](features/fe-be-integration-roadmap.md) - Tier 1 for replacing FE mocks with real BE: phases F Foundation (auth), C Content, G Graph, N Activity, X Cleanup; BE track; deviations from MAP
- [FE-BE Integration As-Built](features/fe-be-integration.md) - implemented real-BE adoption (phases F auth, C content, G graph, N activity, X cleanup: slice switch & default, api-client, cross-tab refresh, adapters, notifications push), design decisions & pitfalls
- [BE Test Spec](features/backend-unit-test.md) - 3 test layers (Domain 60, Application 41, API integration 418): WebApplicationFactory harness, in-place store reset & deterministic seed, race/probe tests, Domain/Application matrix (existing vs backlog)


## Backend Audit (`.context/backend/`)
- [BE Guide](backend/architecture/backend-guide.md) - request lifecycle & behavior order, DI, error pipeline (ProblemDetails + `code`), auth lifecycle (refresh/logout/switch, session lock), UoW & event dispatch semantics, concurrency & non-production statement, single live debt & deferred register §10 (EF/transactions open), notifications pipeline, probes ledger
- [Domain Model](backend/architecture/domain-model.md) - aggregates, identity semantics (`sub` vs `user_id`), rules with code & kind, follow/block/post state machines, events (all live), repo contracts (set-based members)
- [FE-BE Mapping](backend/integration/frontend-backend-mapping.md) - owner of FE contract: endpoint matrix with statuses, published error codes, DTO shapes, FE coverage, open-risk summary, checkpoints CP0-CP4 & FE follow-ups, decided D-ids
- [BE Recovery & FE Integration Plan](backend/plans/2026-10-15-backend-recovery-&-fe-integration.md) - phased tasks T0-T4 (all done), decisions D1-D24, debt & deferred triage (§8, history only; live register = BG §10), session synchronization & access policy (error catalog & DTOs moved to MAP/BG), dependencies, tests, FE checkpoints, risks
- FE-BE Integration plan (FE repo, all phases F/C/G/N/X, executed; X.2 optional pending): `ysocial-clients/web-app/docs/plans/2026-10-16-fe-be-integration.md`
