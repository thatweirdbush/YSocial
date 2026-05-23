using MediatR;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Application.Models;
using YSocial.Domain.Likes;
using YSocial.Domain.Likes.Events;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Likes.EventHandlers;

internal sealed class CreateNotificationWhenLikedHandler(
    IUserRepository userRepository,
    INotificationRepository notificationRepository,
    INotificationOutboxService outboxService) : INotificationHandler<LikeCreatedEvent>
{
    public async Task Handle(LikeCreatedEvent notification, CancellationToken cancellationToken)
    {
        var liker = await userRepository.GetByIdAsync(notification.LikerId, cancellationToken);
        if (liker is null)
            return;

        string contentMessage = notification.TargetType == LikeTargetType.Post
            ? $"{liker.Username} liked your post."
            : $"{liker.Username} liked your comment.";

        var metaDataPayload = new
        {
            targetId = notification.TargetId,
            targetType = notification.TargetType.Name
        };

        var likeNotification = Notification.Create(
            recipientId: notification.TargetAuthorId,
            senderId: notification.LikerId,
            type: NotificationType.NewLike,
            title: "New Like",
            content: contentMessage,
            metaData: metaDataPayload
        );

        // 1. Save the notification to main table
        await notificationRepository.AddAsync(likeNotification, cancellationToken);

        // 2. Create DTO to sent via SignalR into a JSON string
        var notificationDto = NotificationPayload.FromDomain(likeNotification);

        // 3. Push to Outbox via Intermediate Service
        await outboxService.EnqueueAsync(
            messageType: nameof(NotificationType.NewLike),
            payload: notificationDto,
            cancellationToken: cancellationToken
        );
    }
}
