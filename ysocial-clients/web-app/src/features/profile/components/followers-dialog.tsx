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

  const [userToUnfollow, setUserToUnfollow] = useState<{ user: FollowerUser, listType: "followers" | "following" } | null>(null);

  const updateFollowState = (user: FollowerUser, listType: "followers" | "following", nextState: boolean) => {
    const updater = (list: FollowerUser[]) =>
      list.map((u) => (u.id === user.id ? { ...u, isFollowing: nextState } : u));

    if (listType === "followers") {
      setFollowers(updater);
    } else {
      setFollowing(updater);
    }
  };

  const handleFollowToggle = (user: FollowerUser, listType: "followers" | "following") => {
    if (user.isFollowing) {
      // Trigger confirmation dialog instead of immediate unfollow
      setUserToUnfollow({ user, listType });
    } else {
      // Follow immediately
      updateFollowState(user, listType, true);
      toast.success(`${t("card.following") || "Following"} @${user.username}`);
    }
  };

  const confirmUnfollow = () => {
    if (userToUnfollow) {
      updateFollowState(userToUnfollow.user, userToUnfollow.listType, false);
      toast.info(`${t("card.unfollow") || "Unfollowed"} @${userToUnfollow.user.username}`);
      setUserToUnfollow(null);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-sm w-[95vw] rounded-3xl p-0 border-zinc-200/50 dark:border-zinc-900 bg-white dark:bg-zinc-950 shadow-2xl z-50 flex flex-col h-[500px] [&>button]:hidden overflow-hidden">
          <Tabs defaultValue={initialTab} className="flex-1 flex flex-col min-h-0 w-full">
            <TabsList className="w-full h-auto! grid grid-cols-2 rounded-none bg-transparent shrink-0 px-0 mb-1">
              <TabsTrigger
                value="followers"
                className="flex flex-col py-3.5 items-center justify-center gap-1 rounded-none border-t-0 border-x-0 border-b border-zinc-200/50 bg-transparent
                           data-[state=active]:bg-transparent! data-[state=active]:shadow-none! data-[state=active]:border-black
                         dark:data-[state=active]:border-white text-zinc-400 dark:text-zinc-500 font-medium
                         hover:text-zinc-600 dark:hover:text-zinc-300 data-[state=active]:text-zinc-900
                         dark:data-[state=active]:text-zinc-100 data-[state=active]:font-bold transition-colors"
              >
                <span className="text-sm leading-none">{t("profile.followersTitle") || "Followers"}</span>
                <span className="text-xs leading-none mt-0.5">{followers.length}</span>
              </TabsTrigger>
              <TabsTrigger
                value="following"
                className="flex flex-col py-3.5 items-center justify-center gap-1 rounded-none border-t-0 border-x-0 border-b border-zinc-200/50 bg-transparent
                           data-[state=active]:bg-transparent! data-[state=active]:shadow-none! data-[state=active]:border-black
                         dark:data-[state=active]:border-white text-zinc-400 dark:text-zinc-500 font-medium
                         hover:text-zinc-600 dark:hover:text-zinc-300 data-[state=active]:text-zinc-900
                         dark:data-[state=active]:text-zinc-100 data-[state=active]:font-bold transition-colors"
              >
                <span className="text-sm leading-none">{t("profile.followingTitle") || "Following"}</span>
                <span className="text-xs leading-none mt-0.5">{following.length}</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="followers" className="flex-1 flex flex-col min-h-0 overflow-y-auto px-5 gap-4">
              {followers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                  <span className="text-sm">{t("profile.emptyFollowers") || "No followers yet"}</span>
                </div>
              ) : (
                followers.map((fUser) => (
                  <div key={fUser.id} className="flex items-center justify-between gap-3 group border-b border-zinc-200/50 dark:border-zinc-900/50 pb-4 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8.5 border border-zinc-300 dark:border-zinc-900 shrink-0">
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
                      className={`text-[11px] font-bold tracking-tight transition-all duration-300 px-3 py-0.5 rounded-full border ${fUser.isFollowing
                        ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450 hover:bg-zinc-200 dark:hover:bg-zinc-850"
                        : "bg-transparent border-zinc-950 dark:border-zinc-100 text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
                        }`}
                    >
                      {fUser.isFollowing ? t("card.following") || "Following" : t("card.follow") || "Follow"}
                    </Button>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="following" className="flex-1 flex flex-col min-h-0 overflow-y-auto px-5 gap-4">
              {following.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
                  <span className="text-sm">{t("profile.emptyFollowing") || "Not following anyone"}</span>
                </div>
              ) : (
                following.map((fUser) => (
                  <div key={fUser.id} className="flex items-center justify-between gap-3 group border-b border-zinc-100/70 dark:border-zinc-900/50 pb-4 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="size-8.5 border border-zinc-300 dark:border-zinc-900 shrink-0">
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
                      className={`text-[11px] font-bold tracking-tight transition-all duration-300 px-3 py-0.5 rounded-full border ${fUser.isFollowing
                        ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450 hover:bg-zinc-200 dark:hover:bg-zinc-850"
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

      {/* Unfollow Confirmation Modal */}
      <Dialog open={userToUnfollow !== null} onOpenChange={(isOpen) => !isOpen && setUserToUnfollow(null)}>
        <DialogContent 
          className="w-[320px] p-6 rounded-3xl bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-900 text-center flex flex-col items-center gap-4 z-[100] [&>button]:hidden"
        >
          <DialogHeader className="flex flex-col items-center gap-3 w-full">
            {userToUnfollow && (
              <Avatar className="size-18 border border-zinc-100 dark:border-zinc-900 shadow-sm mx-auto">
                <AvatarImage src={userToUnfollow.user.avatarUrl} />
                <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xl font-bold">
                  {userToUnfollow.user.displayName?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>
            )}
            <DialogTitle className="text-md font-semibold text-zinc-900 dark:text-zinc-50 leading-tight mx-auto">
              {userToUnfollow ? (t("profile.unfollowConfirmTitle")?.replace("{username}", userToUnfollow.user.username) || `Unfollow @${userToUnfollow.user.username}?`) : "Unfollow?"}
            </DialogTitle>
          </DialogHeader>
          <div className="w-full flex flex-row sm:flex-row sm:space-x-0 gap-2 mt-2">
            <Button variant="outline" onClick={() => setUserToUnfollow(null)} className="w-full flex-1 rounded-2xl font-bold mt-0 bg-transparent border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-none sm:mt-0">
              {t("profile.unfollowConfirmCancel") || "Cancel"}
            </Button>
            <Button onClick={confirmUnfollow} className="w-full flex-1 rounded-2xl font-bold bg-red-500 hover:bg-red-600 text-white border-none shadow-none">
              {t("profile.unfollowConfirmAction") || "Unfollow"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
