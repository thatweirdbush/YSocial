using MediatR;
using YSocial.Domain.Comments;
using YSocial.Domain.Likes;
using YSocial.Domain.Likes.Events;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Likes.EventHandlers;

internal sealed class UpdateLikeCountWhenLikeToggledEventHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository)
    : INotificationHandler<LikeCreatedEvent>,
      INotificationHandler<LikeRemovedEvent>
{
    public Task Handle(LikeCreatedEvent notification, CancellationToken ct)
        => UpdateCount(notification.TargetId, notification.TargetType, true, ct);

    public Task Handle(LikeRemovedEvent notification, CancellationToken ct)
        => UpdateCount(notification.TargetId, notification.TargetType, false, ct);

    private async Task UpdateCount(Guid targetId, LikeTargetType type, bool isIncrement, CancellationToken ct)
    {
        if (type == LikeTargetType.Post)
        {
            var post = await postRepository.GetByIdAsync(new PostId(targetId), ct);
            if (post is null) return;

            if (isIncrement)
                post.IncrementLikeCount();
            else
                post.DecrementLikeCount();

            postRepository.Update(post);
        }
        else if (type == LikeTargetType.Comment)
        {
            var comment = await commentRepository.GetByIdAsync(new CommentId(targetId), ct);
            if (comment is null) return;

            if (isIncrement)
                comment.IncrementLikeCount();
            else
                comment.DecrementLikeCount();

            commentRepository.Update(comment);
        }
    }
}
