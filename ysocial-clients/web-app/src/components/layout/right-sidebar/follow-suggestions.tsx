"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/use-translation";

import Link from "next/link";

interface MockUser {
  id: string;
  name: string;
  username: string;
  avatar: string;
}

interface FollowSuggestionItemProps {
  user: MockUser;
}

function FollowSuggestionItem({ user }: FollowSuggestionItemProps) {
  const { t } = useTranslation();
  const [isFollowing, setIsFollowing] = useState(false);

  const handleFollowToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextState = !isFollowing;
    setIsFollowing(nextState);
    if (nextState) {
      toast.success(`Following @${user.username}`);
    } else {
      toast.info(`Unfollowed @${user.username}`);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 group">
      <Link href={`/@${user.username}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
        <Avatar className="h-10 w-10 border border-zinc-100 dark:border-zinc-900 shrink-0">
          <AvatarImage src={user.avatar} />
          <AvatarFallback className="bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold">
            {user.name?.charAt(0) || "U"}
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col min-w-0">
          <span className="font-semibold text-sm truncate group-hover:text-zinc-650 dark:group-hover:text-zinc-200 transition-colors">
            {user.name}
          </span>
          <span className="text-zinc-400 text-xs truncate">@{user.username}</span>
        </div>
      </Link>
      <Button
        onClick={handleFollowToggle}
        size="sm"
        variant="outline"
        className={`ml-1.5 text-[11px] font-bold tracking-tight transition-all duration-300 px-3 py-0.5 rounded-full border ${
          isFollowing
            ? "bg-zinc-100 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-450"
            : "bg-transparent border-zinc-950 dark:border-zinc-100 text-black dark:text-white hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black"
        }`}
      >
        {isFollowing ? t("card.following") || "Following" : t("card.follow") || "Follow"}
      </Button>
    </div>
  );
}

export function FollowSuggestions() {
  const { t } = useTranslation();

  // Mock data for premium recommendations to wow the user
  const mockUsers: MockUser[] = [
    { id: "1", name: "Trần Anh Quốc", username: "anquoc.dev", avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&q=80" },
    { id: "2", name: "Nguyễn Hà My", username: "hamy_cute", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=100&q=80" },
    { id: "3", name: "Phan Văn Minh", username: "minh_pvc", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=100&q=80" },
  ];

  return (
    <div className="bg-white/60 dark:bg-zinc-950/20 border border-zinc-200/40 dark:border-zinc-800/40 rounded-3xl p-5 flex flex-col gap-4 shrink-0">
      <h3 className="font-bold text-md tracking-tight">{t("feed.whoToFollow")}</h3>
      <div className="flex flex-col gap-4">
        {mockUsers.map((mUser) => (
          <FollowSuggestionItem key={mUser.id} user={mUser} />
        ))}
      </div>
    </div>
  );
}
