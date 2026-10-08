import { PostSkeletonList } from "@/features/posts";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder with the real header's dimensions (anti-CLS); shared by `loading.tsx` and the hydration gate. */
export function ProfileSkeleton() {
  return (
    <div data-testid="profile-skeleton" className="flex min-h-screen w-full flex-col" aria-busy="true">
      <div className="flex flex-col gap-5 px-4 py-6 md:px-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-7 w-40 bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-4 w-24 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          <Skeleton className="size-20 shrink-0 rounded-full bg-zinc-200 sm:size-24 dark:bg-zinc-800" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-full bg-zinc-200 dark:bg-zinc-800" />
          <Skeleton className="h-3.5 w-3/5 bg-zinc-200 dark:bg-zinc-800" />
        </div>
        <Skeleton className="h-4 w-48 bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-9 w-full rounded-full bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <Skeleton className="h-12 w-full rounded-none bg-zinc-200 dark:bg-zinc-800" />
      <PostSkeletonList count={3} />
    </div>
  );
}
