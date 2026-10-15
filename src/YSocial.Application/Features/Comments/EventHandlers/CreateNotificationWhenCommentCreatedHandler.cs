using MediatR;
using YSocial.Application.Features.Notifications;
using YSocial.Domain.Comments.Events;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Comments.EventHandlers;

internal sealed class CreateNotificationWhenCommentCreatedHandler(
    IUserRepository userRepository,
    IPostRepository postRepository,
    NotificationPublisher publisher) : INotificationHandler<CommentCreatedEvent>
{
    public async Task Handle(CommentCreatedEvent notification, CancellationToken cancellationToken)
    {
        var commenter = await userRepository.GetByIdAsync(notification.AuthorId, cancellationToken);
        var post = await postRepository.GetByIdAsync(notification.PostId, cancellationToken);

        if (commenter is null || post is null) return;

        await publisher.PublishAsync(
            post.AuthorId,
            commenter,
            NotificationType.NewComment,
            "New Comment",
            $"{commenter.Username} commented on your post.",
            post.Id.Value,
            cancellationToken);
    }
}
