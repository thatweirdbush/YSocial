import { MainLayout } from "@/components/layout/main-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchShell, SearchSkeleton } from "@/features/search";

export default function TagLoading() {
  return (
    <MainLayout>
      <SearchShell
        header={
          // Matches TagContainer header (title row + 48px tab bar)
          <div aria-hidden="true">
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <Skeleton className="size-12 shrink-0 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-6 w-36 bg-zinc-200 dark:bg-zinc-800" />
                <Skeleton className="h-3.5 w-20 bg-zinc-200 dark:bg-zinc-800" />
              </div>
            </div>
            <div className="h-12" />
          </div>
        }
      >
        <SearchSkeleton />
      </SearchShell>
    </MainLayout>
  );
}
