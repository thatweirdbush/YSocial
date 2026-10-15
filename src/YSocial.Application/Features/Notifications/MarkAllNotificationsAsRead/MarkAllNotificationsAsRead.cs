using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Notifications;

namespace YSocial.Application.Features.Notifications.MarkAllNotificationsAsRead;

/// <summary>
/// Idempotent: marks every own unread notification as read.
/// </summary>
public sealed record MarkAllNotificationsAsReadCommand : ResultCommand;

internal sealed class MarkAllNotificationsAsReadCommandHandler(
    INotificationRepository notificationRepository,
    IUserContext userContext) : ICommandHandler<MarkAllNotificationsAsReadCommand, Result>
{
    public async Task<Result> Handle(MarkAllNotificationsAsReadCommand request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result.Unauthorized();
        }

        foreach (var notification in (await notificationRepository.GetByRecipientAsync(viewerId, cancellationToken)).Where(n => !n.IsRead))
        {
            notification.MarkAsRead(viewerId);
            notificationRepository.Update(notification);
        }

        return Result.Success();
    }
}
