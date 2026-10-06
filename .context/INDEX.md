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
- [BE Unit Test Spec](features/backend-unit-test.md) - xUnit, NSubstitute & FluentAssertions test matrix: Domain entities, Business Rules, Services, Application CQRS Command/Event Handlers
