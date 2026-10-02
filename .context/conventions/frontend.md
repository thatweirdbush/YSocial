---
module: Frontend Configuration & Coding Rules
stack: Next.js 15 App Router / React / Tailwind / TanStack Query / Zustand
updated: 2026-10-02
---

# FRONTEND CODING STANDARDS

## Frontend "Web Wizard & Designer" Pack (`./.context/.awesome-skills/`)
- `frontend-design`: **[ESSENTIAL]** agent acts as designer-engineer. Forces clear, high-craft, non-generic aesthetic stance (Luxury Minimal); NO default "AI UI" templates
- `nextjs-best-practices` & `tailwind-patterns`: Next.js 15+ App Router patterns (Server vs Client Components separation)
- `react-best-practices` & `react-patterns`: optimize state lifecycle, prevent unnecessary re-renders, modular custom hooks
- `seo-audit`: metadata, OpenGraph & semantic HTML for public routes
- `ui-ux-pro-max`: **[CRITICAL]** minimalist design language (Threads/X-inspired, Zinc tone, subtle borders, high-end negative space)
- `scroll-experience`: CLS prevention, Skeleton shimmers

## Strict Coding Conventions

### 1. Naming
| Target | Case | Example |
|---|---|---|
| Directories & files | `kebab-case` | `features/posts/components/post-card.tsx` |
| Components | `PascalCase` | `PostCard` |
| Variables & functions | `camelCase` | `isLiked` |

### 2. UI & Feature Architecture (Next.js 15 Feature-Driven)
- `src/app/`: file-based routes ONLY. Pages MUST be ultra-thin wrappers importing containers from `features/`. Page metadata/SEO config MUST be declared directly in `page.tsx`
- `src/components/ui/`: flat, read-only Shadcn UI primitives. NO nested folders
- `src/components/layout/`: global app shell wrappers (`MainLayout.tsx`)
- `src/components/shared/`: global UI helpers. NO domain logic, fetching, or business types
- `src/features/`: self-contained domain modules (`components/`, `hooks/`, `services/`, `types/`). Cross-feature imports MUST go through `index.ts`
- `src/hooks/`: global non-domain custom hooks (`use-mobile.ts`)
- `src/lib/`: technical core utils (`api-client.ts`, SignalR hubs)
- `src/lib/constants/`: global layout & app constants (`layout.ts`)
- `src/lib/locales/`: multilingual support (i18n prep)
- `src/lib/store/`: global UI/client state managers (`ui-store.ts` for sidebar, theme, locale)
- **Forms:** React Hook Form + Zod. Single-rule inline; multi-rule multi-line

### 3. API Type Generation & Sync
#### Core Principle
- `docs/swagger.json` & `src/lib/api/generated.ts` are **GENERATED READONLY ARTIFACTS**
- ALL API types originate ONLY from BE schema

#### Scripts & Workflows
- `npm run api:generate`: regenerate TypeScript definitions from `docs/swagger.json` into `src/lib/api/generated.ts`
- `npm run api:check`: runs in CI (`openapi-typescript --check`) to verify `generated.ts` in sync with `swagger.json`
- `npm run api:update`: fetch latest Swagger spec from active BE service & regenerate types in a single step

#### Feature-Level Usage (Vertical Slice Architecture)
NEVER import directly from `generated.ts` in UI components. Selectively extract & re-export DTO types in `src/features/[feature]/types/index.ts`:

```typescript
// src/features/posts/types/index.ts
import type { components } from '@/lib/api/generated';

// Domain-specific DTO re-exports
export type PostDto = components['schemas']['PostDto'];
export type CreatePostRequest = components['schemas']['CreatePostRequest'];
```

#### `types/index.ts` Layout & Import Rules
- **File order:** `Backend DTOs` region (re-exports via `type Schemas = components["schemas"]`) -> `Domain models` -> `Form schemas & values` (Zod + `*FormValues`, kept as-is)
- *Single file per feature:* `src/features/[feature]/types/index.ts` (no `types/creator.ts`-style splits)
- Domain models live in `types/`, NOT in `components/` or `store/`. E.g.:
  - `PostItem`/`PostAuthor`/`PostDraft`/`PostAudience` -> `posts/types`
  - `AuthUser` (was `UserProfile` in `auth-store.ts`, renamed to avoid clash with `profile`'s `UserProfile`) -> `auth/types`
  - `ProfileTab` -> `profile/types`
- **UI Props stay next to their component** (non-exported `XxxProps`). Imperative ref handles (`PostCreatorCoreRef`) stay in component file (component's UI contract). NEVER put Props into `types/` (e.g. `NotificationItemProps` moved back into `notification-item.tsx`)
- Cross-feature type imports MUST target `@/features/[feature]/types` (e.g. `saved/types` -> `import type { PostItem } from "@/features/posts/types"`). NEVER reach into another feature's `components/`. Feature barrels may also `export type * from "./types"`
- Use `import type` for type-only imports
- Current DTO mapping:

| Feature | DTOs |
|---|---|
| `posts` | Create/UpdatePost, SharePostLinkResponse, ToggleLike, LikeTargetType, Add/UpdateComment |
| `auth` | Login/Logout/RegisterAccount/ForgotPassword/ResetPassword |
| `profile` | UpdateProfile, Gender, SwitchProfile, ToggleCloseFriend |
| `saved` | ToggleSavedItem, SavedItemTargetType |
| `notifications` | none yet |

- `ProblemDetails` is cross-cutting -> belongs in `src/lib/`, not a feature
- Backend swagger currently exposes request DTOs ONLY (responses untyped) -> domain models (`PostItem`, `UserProfile`...) still hand-written; replace with DTO aliases once response schemas appear in `generated.ts`

### 4. State Management & API Integration
- **SSR Fetch:** native Fetch API with Next.js caching
- **CSR Fetch:** TanStack Query. MUST: Optimistic Updates (`onMutate`, `onError`, `onSettled`) for high-frequency actions (e.g. Like toggle)
- **SignalR:**
  - Endpoint: `${Backend_API_Origin}/hubs/notifications`
  - Pass JWT Bearer token in query string: `?access_token={token}`
  - Enable `withAutomaticReconnect()`
  - Listen to `ReceiveNotification`
- **Zustand:**
  - Global states in `src/lib/store/`, feature states in `src/features/[feature]/store/`
  - Separate State & Actions. Use `useShallow` when selecting multiple attributes
  - SSR-safe initial state: NEVER read `localStorage`/`navigator`/`window` in store initializer - server & first client render MUST match. Use fixed default (locale: `DEFAULT_LOCALE = "vi"`), apply client values after mount (`ui-store` `hydrateLocale()` called from `Providers` in `useLayoutEffect`)
- **Responsive Shell:** `MainLayout` center column fluid below `lg` (`LAYOUT.main` = `w-full max-w-[600px]`, `min-w-0`), fixed `lg:w-[600px] lg:shrink-0` from `lg` up. NEVER put fixed px width on a column that renders on mobile
- **API mapping:** DTOs in `src/lib/api/generated.ts` auto-generated from `swagger.json`. Follow schema casing directly or use clean transform functions in `services/`

### 5. Micro-UX
- **Rendering:** Hybrid architecture. Strict SSR/SSG with proper OpenGraph metadata for public routes (e.g. `app/[@username]/page.tsx`). Dashboards & private feeds MUST use CSR
- **CLS prevention:** Skeletons MUST match target Post card dimensions. Shimmer effects; NO raw circular loading spinners on content feeds
- **Micro-animations:** Like button "pop & sparkle"; Share icon rotates to checkmark
- **Empty states:** Vector illustration + Gen Z status message + contextual CTA
- **Scroll performance:** perfect Scroll Restoration MUST be active on Feed navigation. Back from post detail view MUST retain exact previous scroll container position
- **Offline resiliency:** Clean global offline banner alert. Config TanStack Query to auto retry failed requests once internet restored

## Forbidden Patterns
- NO inline CSS
- NO unapproved animation/icon libraries; ONLY Lucide & Radix Primitives (Vega Preset)
- NEVER update code outside `ysocial-clients/web-app/`
