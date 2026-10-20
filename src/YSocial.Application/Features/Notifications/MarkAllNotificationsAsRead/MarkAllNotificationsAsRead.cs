using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Notifications;

namespace YSocial.Application.Features.Notifications.MarkAllNotificationsAsRead;

/// <summary>
/// Idempotent: marks own unread notifications as read. With <paramref name="UpToId"/> only that notification and
/// older ones (by creation time, ties included) are marked, so rows that arrived after the client's last view stay unread.
/// </summary>
public sealed record MarkAllNotificationsAsReadCommand(Guid? UpToId = null) : ResultCommand;

internal sealed class MarkAllNotificationsAsReadCommandHandler(
    INotificationRepository notificationRepository,
    AccessibleNotifications notifications,
    IUserContext userContext) : ICommandHandler<MarkAllNotificationsAsReadCommand, Result>
{
    public async Task<Result> Handle(MarkAllNotificationsAsReadCommand request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result.Unauthorized();
        }

        DateTime? watermark = null;
        if (request.UpToId is { } upToId)
        {
            // Plain lookup, no access filter: the sender may have been blocked after the client loaded the page
            var bound = await notificationRepository.GetByIdAsync(new NotificationId(upToId), cancellationToken);
            if (bound is null)
            {
                return Result.NotFound("Notification not found.");
            }

            if (bound.RecipientId != viewerId)
            {
                return Result.Forbidden("Only the recipient can read this notification.", ErrorCodes.NotNotificationRecipient);
            }

            watermark = bound.CreatedAt;
        }

        var unread = (await notifications.LoadAsync(viewerId, cancellationToken))
            .Where(n => !n.Notification.IsRead && (watermark is null || n.Notification.CreatedAt <= watermark));

        foreach (var (notification, _) in unread)
        {
            notification.MarkAsRead(viewerId);
            notificationRepository.Update(notification);
        }

        return Result.Success();
    }
}
