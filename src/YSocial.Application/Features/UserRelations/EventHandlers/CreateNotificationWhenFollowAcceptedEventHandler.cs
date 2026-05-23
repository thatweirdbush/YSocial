using MediatR;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Application.Models;
using YSocial.Domain.Notifications;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class CreateNotificationWhenFollowAcceptedEventHandler(
    IUserRepository userRepository,
    INotificationRepository notificationRepository,
    INotificationOutboxService outboxService) : INotificationHandler<UserFollowAcceptedEvent>
{
    public async Task Handle(UserFollowAcceptedEvent notification, CancellationToken cancellationToken)
    {
        var userIds = new[] { notification.ObserverId, notification.TargetId };
        var users = await userRepository.GetUsersByIdsAsync(userIds, cancellationToken);

        var observer = users.FirstOrDefault(u => u.Id == notification.ObserverId);
        var target = users.FirstOrDefault(u => u.Id == notification.TargetId);

        if (observer is null || target is null) return;

        var metaDataPayload = new { observerId = observer.Id.Value };

        var followNotification = Notification.Create(
            recipientId: target.Id,
            senderId: observer.Id,
            type: NotificationType.FollowAccepted,
            title: "Follow Request Accepted",
            content: $"{observer.Username} started following you.",
            metaData: metaDataPayload
        );

        // 1. Save the notification to main table
        await notificationRepository.AddAsync(followNotification, cancellationToken);

        // 2. Create DTO to sent via SignalR into a JSON string
        var notificationDto = NotificationPayload.FromDomain(followNotification);

        // 3. Push to Outbox via Intermediate Service
        await outboxService.EnqueueAsync(
            messageType: nameof(NotificationType.FollowAccepted),
            payload: notificationDto,
            cancellationToken: cancellationToken
        );
    }
}
