import { Skeleton } from "@/components/ui/skeleton";
import { PostSkeletonList } from "@/features/posts";

/** Matches `UserResultRow` (72px) so results replace it without layout shift. */
export function UserRowSkeleton() {
  return (
    <div className="flex h-[72px] items-center gap-3 px-4" aria-hidden="true">
      <Skeleton className="size-10 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-800" />
      <div className="flex flex-1 flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32 bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-3 w-48 bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

export function SearchSkeleton() {
  return (
    <div data-testid="search-skeleton" aria-busy="true" className="flex flex-col">
      {Array.from({ length: 3 }, (_, index) => (
        <UserRowSkeleton key={index} />
      ))}
      <div className="border-t border-zinc-200/60 dark:border-zinc-900/60">
        <PostSkeletonList count={3} />
      </div>
    </div>
  );
}
