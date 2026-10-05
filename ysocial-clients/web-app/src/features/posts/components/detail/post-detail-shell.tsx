import type { ReactNode } from "react";
import { PostDetailHeader } from "./post-detail-header";

/** Page frame shared by route loading UI & container. */
export function PostDetailShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col w-full min-h-screen pb-20 lg:pb-12 bg-white dark:bg-black">
      <PostDetailHeader />
      {children}
    </div>
  );
}
