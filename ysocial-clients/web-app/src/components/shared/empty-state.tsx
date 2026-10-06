import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

/** Centered empty/error placeholder: icon bubble + title + optional description and CTA. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center gap-4">
      <div className="h-16 w-16 rounded-full bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-400">
        <Icon className="h-8 w-8" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="font-bold text-lg">{title}</h3>
        {description ? <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-[280px]">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
