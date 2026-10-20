import { ApiError } from "@/lib/api-error";
import type {
  NotificationDto,
  NotificationItemData,
  NotificationKind,
  NotificationPage,
  NotificationPageDto,
  NotificationPreferences,
  NotificationPreferencesDto,
} from "../types";

// DTO -> domain (MAP §2.7): `kind` groups the list (like | reply | follow); `type` keeps the finer BE wording.
// Both are plain strings in swagger, so an unknown value renders generic (`other`) instead of breaking the list.

const KIND_BY_TYPE: Readonly<Record<string, NotificationKind>> = {
  NewLike: "like",
  NewComment: "reply",
  NewFollow: "follow",
  FollowRequested: "follow",
  FollowAccepted: "follow",
};

const KNOWN_KINDS: ReadonlySet<string> = new Set<NotificationKind>(["like", "reply", "follow"]);

function toKind(dto: NotificationDto): NotificationKind {
  if (dto.kind && KNOWN_KINDS.has(dto.kind)) return dto.kind as NotificationKind;
  return (dto.type ? KIND_BY_TYPE[dto.type] : undefined) ?? "other";
}

export function toNotificationItem(dto: NotificationDto): NotificationItemData {
  if (!dto.id) throw new ApiError({ kind: "http", status: 200, code: "Unknown", detail: "Malformed NotificationDto: missing id" });
  const kind = toKind(dto);
  return {
    id: dto.id,
    kind,
    type: dto.type ?? undefined,
    user: {
      id: dto.senderId ?? "",
      username: dto.senderUsername ?? "",
      displayName: dto.senderName ?? "",
      avatarUrl: dto.senderAvatar ?? undefined,
    },
    createdAt: dto.createdAt ?? "",
    isRead: dto.isRead ?? false,
    ...(kind === "like" || kind === "reply" ? { postId: dto.targetId ?? undefined } : {}),
    ...(kind === "other" ? { message: dto.message ?? undefined } : {}),
  };
}

export function toNotificationPage(dto: NotificationPageDto): NotificationPage {
  return {
    items: (dto.items ?? []).map(toNotificationItem),
    nextPage: dto.hasNextPage ? (dto.page ?? 1) + 1 : undefined,
    unreadCount: dto.unreadCount ?? 0,
  };
}

/** The BE always sends all three (required on PUT); a missing field would mean "on", the BE default. */
export function toNotificationPreferences(dto: NotificationPreferencesDto): NotificationPreferences {
  return { likes: dto.likes ?? true, replies: dto.replies ?? true, follows: dto.follows ?? true };
}
