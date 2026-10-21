import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Placeholder rows with the height of a notification row (no layout shift when the list arrives). */
export const NotificationSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => (
  <div className="flex flex-col" role="status" aria-busy="true">
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="px-4 py-4 flex gap-4 items-start">
        <Skeleton className="size-10 rounded-full shrink-0" />
        <div className="flex-1 flex flex-col gap-2 pt-0.5">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/4" />
        </div>
      </div>
    ))}
  </div>
);
