import type { MeDto } from "@/features/auth";
import type { UserProfileDto } from "@/features/profile/types";
import { apiClient } from "@/lib/api-client";
import type { SessionDto, SessionItem } from "../types";
import { toWireBirthDate } from "../utils/birth-date";

/** Request enum values (`UpdateProfileRequest.gender`); reads come back as the lowercase names. */
export const GENDER_TO_INT = { unspecified: 0, male: 1, female: 2, other: 3 } as const;
export type GenderValue = keyof typeof GENDER_TO_INT;
export const GENDER_VALUES = Object.keys(GENDER_TO_INT) as GenderValue[];

export const parseGender = (value: string | null | undefined): GenderValue =>
  GENDER_VALUES.find((gender) => gender === value) ?? "unspecified";

export interface AccountPatch {
  gender: GenderValue;
  /** `yyyy-MM-dd`, or `null` = leave the stored birth date alone (the BE cannot clear it). */
  dateOfBirth: string | null;
}

/**
 * `PUT profiles/me` REPLACES name, bio, avatar & cover, so the current values from the `GET me` snapshot are re-sent;
 * gender is always sent, an omitted birth date keeps the stored one.
 */
export async function saveAccountProfile(me: MeDto, patch: AccountPatch): Promise<UserProfileDto> {
  const profile = me.profile;
  if (!profile) throw new Error("Account snapshot has no profile");

  return apiClient.put<UserProfileDto>("/api/users/profiles/me", {
    displayName: profile.displayName,
    bio: profile.bio ?? null,
    avatarUrl: profile.avatarUrl ?? null,
    coverUrl: profile.coverUrl ?? null,
    gender: GENDER_TO_INT[patch.gender],
    ...(patch.dateOfBirth ? { dateOfBirth: toWireBirthDate(patch.dateOfBirth) } : {}),
  });
}

const toSessionItem = (dto: SessionDto): SessionItem | null =>
  dto.id
    ? {
        id: dto.id,
        userAgent: dto.userAgent ?? null,
        profileUsername: dto.profileUsername ?? null,
        createdAt: dto.createdAt ?? "",
        lastTokenIssuedAt: dto.lastTokenIssuedAt ?? "",
        isCurrent: dto.isCurrent === true,
      }
    : null;

/** Active sign-ins of the account, newest token issue first (the BE order is kept). */
export async function fetchSessions(): Promise<SessionItem[]> {
  const sessions = await apiClient.get<SessionDto[]>("/api/identities/sessions");
  return (sessions ?? []).map(toSessionItem).filter((session): session is SessionItem => session !== null);
}

/** Ends the session of ANY of its token ids (204; 404 unknown or foreign). The revoked device's access token lives until expiry. */
export async function revokeSession(id: string): Promise<void> {
  await apiClient.delete(`/api/identities/sessions/${id}`);
}

/** Soft-deletes the account & its profiles (204, existing access tokens live until expiry); the caller ends the local session. */
export async function deleteAccount(): Promise<void> {
  await apiClient.delete("/api/identities/account");
}
