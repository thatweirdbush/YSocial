# Project Knowledge Index

## Conventions (`.context/conventions/`)
- [Agentic Rules & Workflows](conventions/00-agentic-rules.md) - Persona, Superpowers workflows, Task Closure protocol, Systematic Debugging (Rule of Two Failures), architecture guardrails
- [Document Standards](conventions/01-doc-standards.md) - Token optimization rules, ASCII syntax, concise style, no emojis
- [BE Conventions](conventions/backend.md) - C# .NET 8 DDD, CQRS (MediatR), StronglyTypedIds, Domain/Application rules
- [FE Conventions](conventions/frontend.md) - Next.js 15 App Router, React Server vs Client Components, Tailwind CSS, TypeScript guidelines, API integration patterns

## Feature Specs (`.context/features/`)
- [Identities Spec](features/identities.md) - Account registration, JWT auth, Refresh Token session limits & OTP password reset
- [Post Creator Spec](features/post-creator.md) - Dynamic post creation engine, Zustand draft persistence, Radix UI popovers, memory-safe media upload previews (`URL.revokeObjectURL`), multi-tier Escape key shield logic
- [User Profile & Relations Spec](features/user-profile-and-relations.md) - User profiles, follow states (Pending vs Accepted), Close Friends toggle, soft-deleted relation restore, self-block prevention with auto-purging active follows
- [FE Roadmap](features/frontend-roadmap.md) - FE audit (2026-10-01) & prioritized 8-phase checklist (Foundation -> Post Detail -> Search -> Social graph -> Notifications -> Settings -> DMs -> Engagement -> Polish), mock data ONLY, no BE
- [Post Detail Spec](features/post-detail.md) - `/posts/[id]` thread + 1-level replies, mock `post-service` + normalized Zustand `post-store` (like/bookmark/reply sync), Vitest/RTL setup, design decisions & pitfalls
- [Search & Tags Spec](features/search.md) - `/search` explore + Top/Users/Posts/Hashtag tabs, ARIA combobox suggestions, persisted recent searches, `/tags/[tag]`, linkified `#tag`/`@mention`, mock `user-service` + `user-store` (follow sync), diacritics-insensitive matching
- [Feed & Post Interaction Spec](features/feed-post-interaction.md) - "N bài mới" pill (simulated push stream, per-tab consumed buffer), owner actions (edit/delete/pin/hide likes, service-enforced ownership, field-scoped rollback, tombstones), author hover card, viewer-scoped follow graph & `user-store`, shared `src/mocks/` seeds
- [Profile Core Spec](features/profile.md) - `/@username` on mocks: server-resolved route + real 404 (session cookie bridge), SSR-safe auth hydration, viewer/actor identity split, graph-derived counts & fans, profile tab controller, followers dialog, share link + QR
- [Relationship Controls Spec](features/relationship-controls.md) - private account & follow requests, close friends, block / mute on mocks: relation-graph + visibility contract, op-ledger ordering, viewer-switch invalidation, `/settings` shell
- [BE Unit Test Spec](features/backend-unit-test.md) - xUnit, NSubstitute & FluentAssertions test matrix: Domain entities, Business Rules, Services, Application CQRS Command/Event Handlers

## Backend Audit (`.context/backend/`)
- [BE Guide](backend/architecture/backend-guide.md) - actual request lifecycle, behavior order, DI, exceptions->500, JWT/`IUserContext`, in-memory UoW & event-dispatch defects, tech debt, deviations from older docs
- [Domain Model](backend/architecture/domain-model.md) - aggregates, identity semantics (`sub` vs `user_id`), rules, follow/block/post state machines, events (live vs never dispatched), repo contracts
- [FE-BE Mapping](backend/integration/frontend-backend-mapping.md) - endpoint matrix by feature, FE roadmap coverage, ranked integration risks, recommended order, open contract decisions
- [BE Recovery & FE Integration Plan](backend/plans/2026-10-15-backend-recovery-&-fe-integration.md) - phased tasks T0-T4 (errors, auth lifecycle, event dispatch, read MVP, graph), contract decisions D1-D20 with defaults, dependencies, tests, FE checkpoints, risks
