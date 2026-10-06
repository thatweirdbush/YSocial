import { Search } from "lucide-react";
import type { ReactNode } from "react";

interface SearchShellProps {
  /** Sticky header content (search box, tabs, title). */
  header: ReactNode;
  children: ReactNode;
}

/** Page frame shared by route loading UI & containers, so the header never jumps (CLS). */
export function SearchShell({ header, children }: SearchShellProps) {
  return (
    <div className="flex min-h-screen w-full flex-col bg-white pb-20 lg:pb-12 dark:bg-black">
      <header className="sticky top-0 z-20 shrink-0 border-b border-zinc-200/60 bg-white/70 backdrop-blur-md dark:border-zinc-900/60 dark:bg-black/70">
        {header}
      </header>
      {children}
    </div>
  );
}

/** Static stand-in for `SearchBox variant="page"` while the route loads. */
export function SearchBoxPlaceholder() {
  return (
    <div className="px-4 pt-3 pb-3" aria-hidden="true">
      <div className="flex h-12 items-center gap-2 rounded-2xl border border-zinc-200/60 bg-white/70 px-4 dark:border-zinc-800/60 dark:bg-zinc-950/40">
        <Search className="size-5 shrink-0 text-zinc-400" />
      </div>
    </div>
  );
}
