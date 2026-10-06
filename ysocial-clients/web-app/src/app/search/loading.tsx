import { MainLayout } from "@/components/layout/main-layout";
import { SearchBoxPlaceholder, SearchShell, SearchSkeleton } from "@/features/search";

export default function SearchLoading() {
  return (
    <MainLayout>
      <SearchShell header={<SearchBoxPlaceholder />}>
        <SearchSkeleton />
      </SearchShell>
    </MainLayout>
  );
}
