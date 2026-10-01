# Project Knowledge Index

## Conventions (`.context/conventions/`)
- [Agentic Rules & Workflows](conventions/00-agentic-rules.md) — Persona, Superpowers workflows, Task Closure protocol, Systematic Debugging (Rule of Two Failures), architecture guardrails.
- [Backend Conventions](conventions/backend.md) — C# .NET 8 DDD, CQRS (MediatR), StronglyTypedIds, Domain/Application rules.
- [Frontend Conventions](conventions/frontend.md) — Next.js 15 App Router, React Server Components vs Client Components, Tailwind CSS, TypeScript guidelines, API integration patterns.

## Feature Specs (`.context/features/`)
- [Identities Spec](features/identities.md) — Account registration, JWT auth, Refresh Token session limits & OTP password reset mechanics.
- [Post Creator Spec](features/post-creator.md) — Dynamic post creation engine with Zustand draft persistence, Radix UI popovers, memory-safe media upload previews (`URL.revokeObjectURL`) & multi-tier Escape key shield logic.
- [User Profile & Relations Spec](features/user-profile-and-relations.md) — User profiles, follow states (Pending vs Accepted), Close Friends toggling, soft-deleted relation restoration & self-block prevention with auto-purging active follows.
- [Frontend Roadmap](features/frontend-roadmap.md) — FE audit (2026-10-01) & prioritized 8-phase checklist (Foundation → Post Detail → Search → Social graph → Notifications → Settings → DMs → Engagement → Polish), mock-data only, no backend.
- [Backend Unit Test Spec](features/backend-unit-test.md) — Comprehensive xUnit, NSubstitute & FluentAssertions test matrix covering Domain entities, Business Rules, Services & Application CQRS Command/Event Handlers.
