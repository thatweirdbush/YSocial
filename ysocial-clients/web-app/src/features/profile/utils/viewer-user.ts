import { toMockSession, type AuthUser } from "@/features/auth";
import type { ViewerUserInput } from "../types";

/** Maps the signed-in mock account to the identity + profile fields `user-service` registers as a user. */
export function toViewerUserInput(user: AuthUser): ViewerUserInput {
  const { username } = toMockSession(user);
  return {
    id: user.id,
    username,
    displayName: user.displayName ?? username,
    ...(user.bio ? { bio: user.bio } : {}),
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
  };
}
