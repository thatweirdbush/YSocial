using MediatR;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Application.Models;
using YSocial.Domain.Comments.Events;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.EventHandlers;

internal sealed class CreateNotificationWhenCommentCreatedHandler(
    IUserRepository userRepository,
    IPostRepository postRepository,
    INotificationRepository notificationRepository,
    INotificationOutboxService outboxService) : INotificationHandler<CommentCreatedEvent>
{
    public async Task Handle(CommentCreatedEvent notification, CancellationToken cancellationToken)
    {
        var commenterTask = userRepository.GetByIdAsync(notification.AuthorId, cancellationToken);
        var postTask = postRepository.GetByIdAsync(notification.PostId, cancellationToken);

        await Task.WhenAll(commenterTask, postTask);

        var commenter = await commenterTask;
        var post = await postTask;

        if (commenter is null || post is null) return;

        var metaDataPayload = new { postId = notification.PostId };

        var followNotification = Notification.Create(
            recipientId: post.AuthorId,
            senderId: commenter.Id,
            type: NotificationType.NewComment,
            title: "New Comment",
            content: $"{commenter.Username} commented on your post.",
            metaData: metaDataPayload
        );

        // 1. Save the notification to main table
        await notificationRepository.AddAsync(followNotification, cancellationToken);

        // 2. Create DTO to sent via SignalR into a JSON string
        var notificationDto = NotificationPayload.FromDomain(followNotification);

        // 3. Push to Outbox via Intermediate Service
        await outboxService.EnqueueAsync(
            messageType: nameof(NotificationType.NewComment),
            payload: notificationDto,
            cancellationToken: cancellationToken
        );
    }
}
