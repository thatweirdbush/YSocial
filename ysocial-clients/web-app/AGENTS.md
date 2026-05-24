# YSocial Frontend Configuration & Agentic Rules

This file defines the strict operational boundaries, engineering standards, and skill profiles required for building the YSocial Frontend client. All AI Agents (Cursor, Claude, Gemini) MUST read and adhere to this playbook.

---

## Environment & Path Context
- **Antigravity Awesome Skills Path:** `./.antigravity-awesome-skills/`
- **Superpowers Skills Path:** `./.superpowers-skills/`
- **Backend API Origin:** `https://localhost:49895`
- **Frontend Dev Origin:** `http://localhost:3000`

---

## Active Superpowers Workflow Profiles (The Methodology)
You MUST check for and activate the following core skills before starting any task. These are mandatory workflows, not suggestions:

### 1. The Basic Workflow Sequence
- `brainstorming`: Activates before writing code. Refine ideas through Socratic design questions, explore alternatives, present design in sections for validation, and save the design document to `docs/specs/`.
- `using-git-worktrees`: Activates after design approval. Create an isolated workspace on a new branch and verify a clean test baseline.
- `writing-plans`: Break work into bite-sized tasks (2-5 minutes each) with exact file paths, complete code, and verification steps inside Plan Mode.
- `subagent-driven-development` or `executing-plans`: Execute tasks in batches with human checkpoints or dispatch fresh subagents per task with a two-stage review (spec compliance, then code quality).
- `test-driven-development`: Enforce RED-GREEN-REFACTOR. Write a failing test first, watch it fail, write minimal production code to pass, then commit. Delete any code written before tests.
- `requesting-code-review`: Review progress against the plan between tasks and report issues by severity. Critical issues block progress.
- `finishing-a-development-branch`: Verify all tests, present merge/PR options, and clean up the worktree.

### 2. Required Debugging & Meta Skills
- `verification-before-completion`: Ensure bugs are actually fixed via runtime/compiler evidence before declaring success. No performative agreement.

## Active Antigravity Skill Bundles (The Craft)

Load these specific profiles ONLY when the prompt matches the domain context:

### 1. The "Essentials" Starter Pack (Always Active)
- `concise-planning`: Break down the task into a structural component tree/wireframe *before* outputting any React code.
- `lint-and-validate`: Keep TypeScript strict, run ESLint checks, and maintain zero compilation warnings.
- `systematic-debugging`: Follow a disciplined root-cause analysis workflow whenever a build or runtime error occurs.
- `kaizen`: Always seek refactoring opportunities for maximum simplicity and reusability.

### 2. The "Web Wizard" Pack (For Architecture, Logic & Data)
- `frontend-design`: **[ESSENTIAL]** Directs the agent to act as a designer-engineer. Forces a clear, high-craft, non-generic aesthetic stance (e.g., Luxury Minimal for YSocial) and strictly forbids default "AI UI" templates.
- `nextjs-best-practices`: Enforce Next.js 15+ App Router patterns (Server vs. Client Components separation).
- `react-best-practices` & `react-patterns`: Optimize state lifecycle, prevent unnecessary re-renders, and write modular custom hooks.
- `tailwind-patterns`: Leverage semantic utility classes cleanly.
- `seo-audit`: Ensure proper Metadata, OpenGraph tags, and semantic HTML for public routes like `app/[@username]/page.tsx`.

### 3. The "Web Designer" Pack (For Pixel-Perfect UI & Micro-UX)
- `ui-ux-pro-max`: **[CRITICAL]** Enforce the minimalist design language (Threads/X-inspired, Zinc tone, subtle borders, high-end negative space).
- `scroll-experience`: Ensure smooth layout transitions during infinite scrolling (`useInfiniteQuery`). Ensure Skeleton shimmers match exact layout dimensions to eliminate Cumulative Layout Shift (CLS).

---

## Strict Coding Conventions

### 1. Naming Regulations
- **Directories & Files:** Must use `kebab-case` (e.g., `features/posts/components/post-card.tsx`, `features/posts/hooks/use-infinite-posts.ts`).
- **Components:** Must use `PascalCase` (e.g., `PostCard`, `CommentSection`).
- **Variables, State, & Functions:** Must use `camelCase` (e.g., `isLiked`, `handleLikeSubmit`).

### 2. UI & Feature Architecture (Next.js 15 Feature-Driven Blueprint)
- `src/app/`: File-based routing layers only. Pages must remain ultra-thin, acting merely as entry points that import containers from the `features/` directory. Page metadata/SEO configurations must be declared directly inside `page.tsx`.
- `src/components/ui/`: Atomic primitives from Shadcn UI (e.g., `button.tsx`, `input.tsx`). Strictly flat structure (NO nested folders) and read-only.
- `src/components/layout/`: Global structure containers that define the overall application shell layout (e.g., `MainLayout.tsx`, global sidebar wrappers).
- `src/components/shared/`: Global, business-agnostic UI helpers only (e.g., `LoadingSpinner.tsx`, `InfiniteScrollTrigger.tsx`). Strictly NO domain logic, NO API data fetching hooks, and NO business types allowed here.
- `src/features/`: Encapsulated domain modules mapped directly to Backend Bounded Contexts (e.g., `features/posts/`, `features/profile/`). Each folder must fully self-contain its specific `components/` (e.g., `PostCard.tsx`), `hooks/`, `services/`, and `types/`. Cross-feature imports must strictly go through the feature's `index.ts` public gateway.
- `src/lib/`: Reusable technical core utilities (e.g., global `api-client.ts` with 401 token rotation interceptors, SignalR hub configurations).
- Ensure all forms use React Hook Form paired with Zod validation. Single-rule validations should be compact/inline; multi-rule configurations must be multi-line.

### 3. State Management & API Integration
- **Server State & Data Fetching:** 
  - Use native Fetch API for Server-Side Rendering (SSR) pages to leverage Next.js caching.
  - Use TanStack Query for Client-Side Rendering (CSR). **Mandatory Requirement:** Implement Optimistic Updates (`onMutate`, `onError`, `onSettled`) for high-frequency user actions, specifically the Like/Unlike toggle.
- **Real-time Notifications (SignalR):**
  - Endpoint target: `${Backend_API_Origin}/hubs/notifications`.
  - Authentication: Must pass the JWT Bearer token via query string: `?access_token={token}`.
  - Resilience: Enable `withAutomaticReconnect()` explicitly upon connection builder initialization.
  - Event Handling: Listen to the `ReceiveNotification` event. The payload contains a `Type` property as an explicit string enum (e.g., `"NewLike"`, `"NewComment"`).
- **Global Client State (Zustand):**
  - **Global/Cross-feature States:** Configure global states (e.g., `authStore.ts` managing Session/Token, `themeStore.ts`) in the `src/lib/store/` or `src/features/auth/store/` directory.
  - **Feature-specific States:** States specific to a feature (e.g., advanced Post filters, local open/close states of a complex process) MUST be placed directly in that feature's store directory (e.g., `src/features/posts/store/post-filter-store.ts`).
  - **Best Practices:** All Zustand stores must clearly separate State (data) and Actions (functions that change data) to optimize re-rendering and ease of maintenance. Use `useShallow` when selecting multiple attributes to avoid unnecessary re-rendering.
- **API Mapping:** Strictly map response objects from the Backend's `.sln` PascalCase into Frontend camelCase. Refer to `swagger.json` for precise DTO definitions.

### 4. Micro-UX & Interaction Standards (Threads/X-Inspired)
- **Rendering Optimization:** Hybrid Architecture. Enforce strict SSR/SSG with proper OpenGraph metadata for public routes (e.g., `app/[@username]/page.tsx`, `app/posts/[id]/page.tsx`). dashboards and private feeds must use CSR.
- **Cumulative Layout Shift (CLS) Prevention:** Skeletons used during `useInfiniteQuery` loading states must have strict bounding boxes with explicit dimensions matching the exact height/width of rendered Post cards. Shimmer effects only; raw circular loading spinners are strictly forbidden on content feeds.
- **Micro-animations:** 
  - *Like Button (Heart icon):* Must trigger a high-end "pop & sparkle" micro-animation on activation.
  - *Share/Copy Link:* Active state must smoothly rotate the icon into a checkmark (✓), paired with a non-intrusive Toast component.
- **Empty States:** Any empty boundary (Feed, Profile, Notifications) cannot be a blank screen. It must render a minimalist vector illustration, a friendly Gen Z-oriented status message, and a clear Contextual CTA button.
- **Scroll Performance:** Perfect Scroll Restoration must be active on Feed navigation. Navigating back from a post detail view must retain the exact previous scroll container position.
- **Offline Resiliency:** Implement a clean global offline banner alert. TanStack Query must be configured to automatically retry failed requests once internet connectivity is restored.

---

## Forbidden Patterns
- **DO NOT** use inline CSS styles; utilize Tailwind utility classes exclusively.
- **DO NOT** install additional animation or icon libraries without explicit user approval. Stick to Lucide icons and Radix Primitives (Vega Preset).
- **DO NOT** execute any breaking structural updates outside of the `ysocial-clients/web-app/` scope. The Backend (`src/`, `tests/`) is protected under CODEOWNERS.
