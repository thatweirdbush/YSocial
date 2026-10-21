import { apiClient } from "@/lib/api-client";
import { isBackendId, requireBackendId } from "@/lib/backend-id";
import { ForbiddenError } from "@/lib/errors";
import { isNotFound } from "@/lib/server-api";
import type {
  FollowListPageDto,
  FollowStatus,
  ProfilePatch,
  UserProfile,
  UserProfileDto,
  UserProfileDtoPagedResponse,
  ViewerUserInput,
} from "../types";
import { toFollowListPage, toFollowStatus, toUserProfile } from "./user-mapper";

// Real BE adapter of `user-service` (MAP §2.2). Same signatures as the mock; `actorId` is unused where the JWT
// already identifies the viewer. 404 -> `null`, every other failure is rethrown (never shown as "not found").

const FOLLOWING_PAGE_SIZE = 50;
/** Safety cap against a BE that never reports the last page (1000 followed users). */
const FOLLOWING_MAX_PAGES = 20;

async function readProfile(path: string): Promise<UserProfile | null> {
  try {
    return toUserProfile(await apiClient.get<UserProfileDto>(path));
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function fetchUser(id: string, _actorId: string): Promise<UserProfile | null> {
  if (!isBackendId(id)) return null;
  return readProfile(`/api/users/${id}`);
}

export async function fetchUserByUsername(username: string, _actorId: string): Promise<UserProfile | null> {
  return readProfile(`/api/users/by-username/${encodeURIComponent(username.toLowerCase())}`);
}

/**
 * Owner-only edit. The BE replaces name, bio, avatar & cover (the current cover is re-sent); gender & birth date are
 * omitted, which the BE reads as "keep stored value".
 */
export async function updateProfile(id: string, patch: ProfilePatch, actorId: string): Promise<UserProfile> {
  if (actorId !== id) throw new ForbiddenError(`Profile ${id} is not owned by ${actorId}`);
  const current = await apiClient.get<UserProfileDto>(`/api/users/${requireBackendId(id)}`);
  const updated = await apiClient.put<UserProfileDto>("/api/users/profiles/me", {
    displayName: patch.displayName.trim(),
    bio: patch.bio?.trim() || null,
    avatarUrl: patch.avatarUrl || null,
    coverUrl: current.coverUrl ?? null,
  });
  return toUserProfile(updated);
}

/** Idempotent: `accepted` (public target) or `pending` (private target). 404 (missing, blocked) rejects for rollback. */
export async function followUser(id: string, _actorId: string): Promise<FollowStatus> {
  const result = await apiClient.post<{ followStatus?: string | null }>(`/api/users/${requireBackendId(id)}/relations/follow`);
  return toFollowStatus(result?.followStatus);
}

export async function unfollowUser(id: string, _actorId: string): Promise<void> {
  await apiClient.delete(`/api/users/${requireBackendId(id)}/relations/follow`);
}

/**
 * Complete follow set of the viewer: there is no id-only endpoint, so every page of
 * `GET users/{viewer}/following` is read. Any failing page rejects - a partial set would turn followed users into "none".
 */
export async function fetchFollowedIds(actorId: string): Promise<string[]> {
  if (!isBackendId(actorId)) return [];
  const ids: string[] = [];
  for (let page = 1; page <= FOLLOWING_MAX_PAGES; page += 1) {
    const result = await apiClient.get<FollowListPageDto>(`/api/users/${actorId}/following`, {
      params: { page, pageSize: FOLLOWING_PAGE_SIZE },
    });
    for (const item of result.items ?? []) {
      // The list holds the viewer's followed users; a pending request (if ever listed) is not a follow yet
      if (item.id && item.followStatus !== "pending") ids.push(item.id);
    }
    if (!result.hasNextPage) return ids;
  }
  return ids;
}

/** The viewer is already a BE profile: nothing is registered anywhere, the profile is just read. */
export async function upsertViewerUser(input: ViewerUserInput, actorId: string): Promise<UserProfile> {
  const user = await fetchUser(input.id, actorId);
  if (!user) throw new Error(`Unknown user ${input.id}`);
  return user;
}

/** BE ranking (mutual followees, then popularity); the viewer comes from the JWT, `actorId` is never sent. */
export async function fetchSuggestedUsers(limit: number, _actorId: string): Promise<UserProfile[]> {
  const page = await apiClient.get<UserProfileDtoPagedResponse>("/api/users/suggestions", { params: { page: 1, pageSize: limit } });
  return toFollowListPage(page).users;
}
