import { useMemo } from "react";
import { useAuthUser } from "@/features/auth/store/auth-store";
import type { PostAuthor } from "../types";

const GUEST_AUTHOR: PostAuthor = { id: "me", displayName: "Me", username: "me_ysocial" };

/** Maps the signed-in account to a post author; falls back to a guest author when logged out. */
export function useCurrentAuthor(): PostAuthor {
  const user = useAuthUser();

  return useMemo(() => {
    if (!user) return GUEST_AUTHOR;
    const username = user.username ?? user.email.split("@")[0];
    return {
      id: user.id,
      displayName: user.displayName ?? username,
      username,
      avatarUrl: user.avatarUrl,
    };
  }, [user]);
}
