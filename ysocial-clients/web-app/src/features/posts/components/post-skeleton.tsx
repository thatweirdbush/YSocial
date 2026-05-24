import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

// 1. Text-only skeleton: Strict containment bounding box at exactly 168px (10.5rem) height
export function PostSkeletonText() {
  return (
    <div 
      className="w-full h-[168px] min-h-[168px] max-h-[168px] border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white/40 dark:bg-black/20 flex flex-col justify-between select-none"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 168px" }}
    >
      <div className="flex gap-3 items-start">
        {/* Avatar */}
        <Skeleton className="h-10 w-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-800" />
        
        {/* Header and Content Lines */}
        <div className="flex-1 space-y-3 min-w-0">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-3 w-16 bg-zinc-200 dark:bg-zinc-800" />
          </div>
          
          {/* Post content body placeholder */}
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-3.5 w-[92%] bg-zinc-200 dark:bg-zinc-800" />
            <Skeleton className="h-3.5 w-[65%] bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
      
      {/* Actions Toolbar placeholder */}
      <div className="flex items-center gap-8 pl-[52px]">
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

// 2. Media post skeleton: Strict containment bounding box at exactly 480px (30rem) height
export function PostSkeletonMedia() {
  return (
    <div 
      className="w-full h-[480px] min-h-[480px] max-h-[480px] border-b border-zinc-200/60 dark:border-zinc-900/60 p-4 bg-white/40 dark:bg-black/20 flex flex-col justify-between select-none"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 480px" }}
    >
      <div className="flex gap-3 items-start flex-1">
        {/* Avatar */}
        <Skeleton className="h-10 w-10 rounded-full shrink-0 bg-zinc-200 dark:bg-zinc-800" />
        
        {/* Header, text and Media Container */}
        <div className="flex-1 space-y-3 min-w-0 h-full flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800" />
              <Skeleton className="h-3 w-20 bg-zinc-200 dark:bg-zinc-800" />
            </div>
            
            {/* Body placeholder */}
            <Skeleton className="h-3.5 w-4/5 bg-zinc-200 dark:bg-zinc-800" />
          </div>

          {/* Large Image Box */}
          <div className="flex-1 my-2 min-h-[290px] max-h-[290px] w-full">
            <Skeleton className="w-full h-full rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
          </div>
        </div>
      </div>
      
      {/* Actions Toolbar placeholder */}
      <div className="flex items-center gap-8 pl-[52px] pt-2">
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
        <Skeleton className="h-5 w-5 rounded bg-zinc-200 dark:bg-zinc-800" />
      </div>
    </div>
  );
}

// 3. Grid-feeder lists mapping skeletons cleanly
export function PostSkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col w-full">
      {Array.from({ length: count }).map((_, idx) => (
        <React.Fragment key={idx}>
          {idx % 2 === 0 ? <PostSkeletonText /> : <PostSkeletonMedia />}
        </React.Fragment>
      ))}
    </div>
  );
}
