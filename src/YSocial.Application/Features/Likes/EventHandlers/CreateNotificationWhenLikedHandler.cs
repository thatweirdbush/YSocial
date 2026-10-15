using MediatR;
using YSocial.Application.Features.Notifications;
using YSocial.Domain.Comments;
using YSocial.Domain.Likes;
using YSocial.Domain.Likes.Events;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Likes.EventHandlers;

internal sealed class CreateNotificationWhenLikedHandler(
    IUserRepository userRepository,
    ICommentRepository commentRepository,
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

        // FE navigates to the root post (a comment like points at the comment's post)
        var postId = notification.TargetId;
        if (notification.TargetType == LikeTargetType.Comment)
        {
            var comment = await commentRepository.GetByIdAsync(new CommentId(notification.TargetId), cancellationToken);
            if (comment is null) return;

            postId = comment.PostId.Value;
        }

        await publisher.PublishAsync(
            notification.TargetAuthorId,
            liker,
            NotificationType.NewLike,
            "New Like",
            content,
            postId,
            cancellationToken);
    }
}
