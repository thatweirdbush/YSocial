using YSocial.Application.Models.Commons;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Application.Models;

/// <summary>
/// One notification, same shape for <c>GET /api/notifications</c> and the SignalR <c>ReceiveNotification</c> push.
/// <see cref="Type"/> = NewLike | NewComment | NewFollow | FollowRequested | FollowAccepted; <see cref="Kind"/> = like | reply | follow (FE grouping).
/// <see cref="TargetId"/> = post or comment id (like, comment) or the follower id (follow types).
/// </summary>
public sealed record NotificationDto(
    Guid Id,
    string Type,
    string Kind,
    string Title,
    string Message,
    DateTime CreatedAt,
    bool IsRead,
    Guid? TargetId,
    Guid SenderId,
    string? SenderName,
    string? SenderAvatar)
{
    public static NotificationDto From(Notification notification, User? sender) => new(
        notification.Id.Value,
        notification.Type.Name,
        KindOf(notification.Type),
        notification.Title,
        notification.Content,
        notification.CreatedAt,
        notification.IsRead,
        notification.TargetId,
        notification.SenderId.Value,
        sender?.ProfileInfo.DisplayName,
        sender?.ProfileInfo.AvatarUrl);

    private static string KindOf(NotificationType type)
    {
        if (type == NotificationType.NewLike) return "like";
        if (type == NotificationType.NewComment) return "reply";
        return "follow";
    }
}

/// <summary>
/// <see cref="PagedResponse{T}.TotalCount"/> and <see cref="UnreadCount"/> both count only notifications whose sender the viewer may still see.
/// </summary>
public sealed record NotificationPageDto(IReadOnlyList<NotificationDto> Items, int Page, int PageSize, int TotalCount, int UnreadCount)
    : PagedResponse<NotificationDto>(Items, Page, PageSize, TotalCount);

public sealed record UnreadCountDto(int Count);

/// <summary>
/// Outbox content: routing target plus the pushed payload.
/// </summary>
public sealed record NotificationEnvelope(Guid RecipientId, NotificationDto Payload);
