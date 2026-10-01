import { Skeleton } from "@/components/ui/skeleton";
import { PostSkeletonList } from "../post-skeleton";

const BAR = "bg-zinc-200 dark:bg-zinc-800";

/** Root post + composer bar + 3 replies, sized like the loaded thread to avoid layout shift. */
export function PostDetailSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col w-full select-none">
      <div className="p-4 border-b border-zinc-200/60 dark:border-zinc-900/60 flex gap-3">
        <Skeleton className={`h-10 w-10 rounded-full shrink-0 ${BAR}`} />
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className={`h-4 w-32 ${BAR}`} />
            <Skeleton className={`h-3 w-24 ${BAR}`} />
          </div>
          <div className="space-y-2.5">
            <Skeleton className={`h-4 w-full ${BAR}`} />
            <Skeleton className={`h-4 w-[90%] ${BAR}`} />
            <Skeleton className={`h-4 w-[60%] ${BAR}`} />
          </div>
          <Skeleton className={`h-[280px] w-full rounded-2xl ${BAR}`} />
          <div className="flex gap-4 pt-3">
            <Skeleton className={`h-4 w-20 ${BAR}`} />
            <Skeleton className={`h-4 w-24 ${BAR}`} />
          </div>
        </div>
      </div>
      <div className="px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-900/60 flex items-center gap-3 min-h-[68px]">
        <Skeleton className={`h-8 w-8 rounded-full shrink-0 ${BAR}`} />
        <Skeleton className={`h-4 w-40 ${BAR}`} />
      </div>
      <PostSkeletonList count={3} />
    </div>
  );
}
