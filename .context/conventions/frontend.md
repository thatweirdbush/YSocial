---
module: Frontend Configuration & Coding Rules
stack: Next.js 15 App Router / React / Tailwind / TanStack Query / Zustand
---

# FRONTEND CODING STANDARDS

## Frontend "Web Wizard & Designer" Pack (`./.context/.awesome-skills/`)
- `frontend-design`: **[ESSENTIAL]** Agent act as a designer-engineer. Forces a clear, high-craft, non-generic aesthetic stance (Luxury Minimal) & no default "AI UI" templates.
- `nextjs-best-practices` & `tailwind-patterns`: Next.js 15+ App Router patterns (Server vs Client Components separation).
- `react-best-practices` & `react-patterns`: Optimize state lifecycle, prevent unnecessary re-renders, modular custom hooks.
- `seo-audit`: Metadata, OpenGraph & semantic HTML for public routes.
- `ui-ux-pro-max`: **[CRITICAL]** Minimalist design language (Threads/X-inspired, Zinc tone, subtle borders, high-end negative space).
- `scroll-experience`: CLS prevention, Skeleton shimmers.

---

## Strict Coding Conventions

### 1. Naming Regulations
- Directories & Files: `kebab-case` (e.g., `features/posts/components/post-card.tsx`).
- Components: `PascalCase` (e.g., `PostCard`).
- Variables & Functions: `camelCase` (e.g., `isLiked`).

### 2. UI & Feature Architecture (Next.js 15 Feature-Driven)
- `src/app/`: File-based routes only. Pages must be ultra-thin wrappers importing containers from `features/`. Page metadata/SEO configurations must be declared directly inside `page.tsx`.
- `src/components/ui/`: Flat, read-only Shadcn UI primitives. NO nested folders.
- `src/components/layout/`: Global app shell wrappers (`MainLayout.tsx`).
- `src/components/shared/`: Global UI helpers. NO domain logic, fetching, or business types.
- `src/features/`: Self-contained domain modules (`components/`, `hooks/`, `services/`, `types/`). Cross-feature imports MUST go through `index.ts`.
- `src/hooks/`: Global custom hooks non-domain specific (`use-mobile.ts`).
- `src/lib/`: Technical core utilities (`api-client.ts`, SignalR hubs).
- `src/lib/constants/`: Global layout & app constants (`layout.ts`).
- `src/lib/locales/`: Multilingual support (i18n Prep).
- `src/lib/store/`: Global UI/Client state managers (`ui-store.ts` for sidebar, theme, locale).
- **Forms:** React Hook Form + Zod. Single-rule inline; multi-rule multi-line.

### 3. API Type Generation & Synchronization
#### Core Principle
- `docs/swagger.json` & `src/lib/api/generated.ts` are **GENERATED READONLY ARTIFACTS**.
- All API types originate exclusively from the backend schema.

#### Scripts & Workflows
- `npm run api:generate`: Regenerates TypeScript definitions from `docs/swagger.json` into `src/lib/api/generated.ts`.
- `npm run api:check`: Runs in the CI pipeline (`openapi-typescript --check`) to verify `generated.ts` stays in sync with `swagger.json`.
- `npm run api:update`: Fetches the latest Swagger spec from the active backend service & regenerates types in a single step.

#### Feature-Level Usage (Vertical Slice Architecture)
Do not import directly from `generated.ts` inside UI components. Selectively extract & re-export DTO types within `src/features/[feature]/types/index.ts`:

```typescript
// src/features/posts/types/index.ts
import type { components } from '@/lib/api/generated';

// Domain-specific DTO re-exports
export type PostDto = components['schemas']['PostDto'];
export type CreatePostRequest = components['schemas']['CreatePostRequest'];
```

#### `types/index.ts` Layout & Import Rules (refactor 2026-10-01)
- **File order:** `Backend DTOs` region (re-exports via `type Schemas = components["schemas"]`) → `Domain models` → `Form schemas & values` (Zod + `*FormValues`, kept as-is).
- **Single file per feature:** `src/features/[feature]/types/index.ts` (no `types/creator.ts`-style splits).
- **Domain models live in `types/`, NOT in `components/` or `store/`.** E.g. `PostItem`/`PostAuthor`/`PostDraft`/`PostAudience` → `posts/types`; `AuthUser` (was `UserProfile` in `auth-store.ts`, renamed to avoid clashing with `profile`'s `UserProfile`) → `auth/types`; `ProfileTab` → `profile/types`.
- **UI Props stay next to their component** (non-exported `XxxProps`). Imperative ref handles (`PostCreatorCoreRef`) stay in the component file since they're the component's UI contract. Don't put Props into `types/` (e.g. `NotificationItemProps` was moved back into `notification-item.tsx`).
- **Cross-feature type imports MUST target `@/features/[feature]/types`** (e.g. `saved/types` → `import type { PostItem } from "@/features/posts/types"`). Never reach into another feature's `components/`. Feature barrels may also `export type * from "./types"`.
- Use `import type` for type-only imports.
- **Current DTO mapping:** `posts` ← Create/UpdatePost, SharePostLinkResponse, ToggleLike, LikeTargetType, Add/UpdateComment · `auth` ← Login/Logout/RegisterAccount/ForgotPassword/ResetPassword · `profile` ← UpdateProfile, Gender, SwitchProfile, ToggleCloseFriend · `saved` ← ToggleSavedItem, SavedItemTargetType · `notifications` ← none yet. `ProblemDetails` is cross-cutting → belongs in `src/lib/`, not a feature.
- Backend swagger currently exposes **request DTOs only** (responses untyped), so domain models (`PostItem`, `UserProfile`...) are still hand-written; replace them with DTO aliases once response schemas appear in `generated.ts`.

### 4. State Management & API Integration
- **SSR Fetch:** Native Fetch API with Next.js caching.
- **CSR Fetch:** TanStack Query. **Mandatory:** Optimistic Updates (`onMutate`, `onError`, `onSettled`) for high-frequency actions (e.g., Like toggle).
- **SignalR:**
  - Endpoint: `${Backend_API_Origin}/hubs/notifications`.
  - Pass JWT Bearer token in query string: `?access_token={token}`.
  - Enable `withAutomaticReconnect()`.
  - Listen to `ReceiveNotification`.
- **Zustand:**
  - Global states in `src/lib/store/`, feature states in `src/features/[feature]/store/`
  - Separate State & Actions. Use `useShallow` when selecting multiple attributes.
  - **SSR-safe initial state:** Never read `localStorage`/`navigator`/`window` in a store's initializer — server & first client render must match. Use a fixed default (locale: `DEFAULT_LOCALE = "vi"`) and apply client values after mount (`ui-store` `hydrateLocale()` is called from `Providers` in a `useLayoutEffect`).
- **Responsive shell:** `MainLayout` center column is fluid below `lg` (`LAYOUT.main` = `w-full max-w-[600px]`, `min-w-0`) and fixed `lg:w-[600px] lg:shrink-0` from `lg` up. Never put a fixed px width on a column that renders on mobile.
- **API Mapping:** DTOs in `src/lib/api/generated.ts` are automatically generated from `swagger.json`. Follow the schema casing directly or use clean transform functions in `services/`.

### 4. Micro-UX
- **Rendering Optimization:** Hybrid Architecture. Enforce strict SSR/SSG with proper OpenGraph metadata for public routes (e.g., `app/[@username]/page.tsx`, `app/posts/[id]/page.tsx`). dashboards & private feeds must use CSR.
- **CLS Prevention:** Skeletons must match target Post card dimensions. Shimmer effects; no raw circular loading spinners on content feeds.
- **Micro-animations:** Like button "pop & sparkle"; Share icon rotates to checkmark (✓).
- **Empty States:** Vector illustration + Gen Z status message + Contextual CTA.
- **Scroll Performance:** Perfect Scroll Restoration must be active on Feed navigation. Navigating back from a post detail view must retain the exact previous scroll container position.
- **Offline Resiliency:** Clean global offline banner alert. Config TanStack Query to auto retry failed requests once internet is restored.

---

## Forbidden Patterns
- NO inline CSS.
- NO unapproved animation/icon libraries, stick to Lucide & Radix Primitives (Vega Preset).
- NO update code outside `ysocial-clients/web-app/`.
