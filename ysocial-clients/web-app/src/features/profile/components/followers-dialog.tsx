"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";
import { FollowerUser } from "../types";

interface FollowersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  initialTab?: "followers" | "following";
  username: string;
}

export function FollowersDialog({
  open,
  onOpenChange,
  userId,
  initialTab = "followers",
  username,
}: FollowersDialogProps) {
  const { t } = useTranslation();

  // Premium mock lists inside dialog
  const [followers, setFollowers] = useState<FollowerUser[]>([
    { id: "2", displayName: "Nguyễn Hà My", username: "hamy_cute", avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80", isFollowing: true },
    { id: "3", displayName: "Phan Văn Minh", username: "minh_pvc", avatarUrl: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80", isFollowing: false },
  ]);

  const [following, setFollowing] = useState<FollowerUser[]>([
    { id: "1", displayName: "Trần Anh Quốc", username: "anquoc.dev", avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80", isFollowing: true },
    { id: "2", displayName: "Nguyễn Hà My", username: "hamy_cute", avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80", isFollowing: true },
  ]);

  const handleFollowToggle = (user: FollowerUser, listType: "followers" | "following") => {
    const isCurrentlyFollowing = user.isFollowing;
    const nextState = !isCurrentlyFollowing;

    const updater = (list: FollowerUser[]) =>
      list.map((u) => (u.id === user.id ? { ...u, isFollowing: nextState } : u));

    if (listType === "followers") {
      setFollowers(updater);
    } else {
      setFollowing(updater);
    }

    if (nextState) {
      toast.success(`Following @${user.username}`);
    } else {
      toast.info(`Unfollowed @${user.username}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md w-[95vw] rounded-3xl p-6 border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 shadow-2xl z-50 flex flex-col h-[500px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            @{username}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={initialTab} className="flex-1 flex flex-col min-h-0 mt-2">
          <TabsList className="w-full grid grid-cols-2 rounded-xl bg-zinc-100 dark:bg-zinc-900/60 p-1 mb-4 shrink-0">
            <TabsTrigger value="followers" className="rounded-lg font-semibold text-sm py-2">
              Người theo dõi
            </TabsTrigger>
            <TabsTrigger value="following" className="rounded-lg font-semibold text-sm py-2">
              Đang theo dõi
            </TabsTrigger>
          </TabsList>

          <TabsContent value="followers" className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
            {followers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                <span className="text-sm">Chưa có người theo dõi nào</span>
              </div>
            ) : (
              followers.map((fUser) => (
                <div key={fUser.id} className="flex items-center justify-between gap-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 border border-zinc-100 dark:border-zinc-900 shrink-0">
                      <AvatarImage src={fUser.avatarUrl} />
                      <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
                        {fUser.displayName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate text-zinc-900 dark:text-zinc-50">
                        {fUser.displayName}
                      </span>
                      <span className="text-zinc-400 text-xs truncate">@{fUser.username}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleFollowToggle(fUser, "followers")}
                    size="sm"
                    variant="outline"
                    className={`text-[11px] font-bold tracking-tight transition-all duration-300 px-3 py-0.5 rounded-full border ${
                      fUser.isFollowing
                        ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450"
                        : "bg-transparent border-zinc-950 dark:border-zinc-100 text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                    }`}
                  >
                    {fUser.isFollowing ? t("card.following") || "Following" : t("card.follow") || "Follow"}
                  </Button>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="following" className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
            {following.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                <span className="text-sm">Chưa đang theo dõi ai</span>
              </div>
            ) : (
              following.map((fUser) => (
                <div key={fUser.id} className="flex items-center justify-between gap-3 group">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar className="h-10 w-10 border border-zinc-100 dark:border-zinc-900 shrink-0">
                      <AvatarImage src={fUser.avatarUrl} />
                      <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
                        {fUser.displayName?.charAt(0) || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col min-w-0">
                      <span className="font-semibold text-sm truncate text-zinc-900 dark:text-zinc-50">
                        {fUser.displayName}
                      </span>
                      <span className="text-zinc-400 text-xs truncate">@{fUser.username}</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleFollowToggle(fUser, "following")}
                    size="sm"
                    variant="outline"
                    className={`text-[11px] font-bold tracking-tight transition-all duration-300 px-3 py-0.5 rounded-full border ${
                      fUser.isFollowing
                        ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450"
                        : "bg-transparent border-zinc-950 dark:border-zinc-100 text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                    }`}
                  >
                    {fUser.isFollowing ? t("card.following") || "Following" : t("card.follow") || "Follow"}
                  </Button>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
