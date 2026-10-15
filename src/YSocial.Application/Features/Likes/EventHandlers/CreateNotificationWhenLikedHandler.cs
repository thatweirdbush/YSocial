using MediatR;
using YSocial.Application.Features.Notifications;
using YSocial.Domain.Likes;
using YSocial.Domain.Likes.Events;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Likes.EventHandlers;

internal sealed class CreateNotificationWhenLikedHandler(
    IUserRepository userRepository,
    NotificationPublisher publisher) : INotificationHandler<LikeCreatedEvent>
{
    public async Task Handle(LikeCreatedEvent notification, CancellationToken cancellationToken)
    {
        var liker = await userRepository.GetByIdAsync(notification.LikerId, cancellationToken);
        if (liker is null)
            return;

        var content = notification.TargetType == LikeTargetType.Post
            ? $"{liker.Username} liked your post."
            : $"{liker.Username} liked your comment.";

        await publisher.PublishAsync(
            notification.TargetAuthorId,
            liker,
            NotificationType.NewLike,
            "New Like",
            content,
            notification.TargetId,
            cancellationToken);
    }
}
