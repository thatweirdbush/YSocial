using MediatR;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.SavedItems.Events;

namespace YSocial.Application.Features.SavedItems.EventHandlers;

internal sealed class UpdateSavedCountWhenSavedItemToggledEventHandler(
    IPostRepository postRepository,
    ICommentRepository commentRepository)
    : INotificationHandler<SavedItemCreatedEvent>,
      INotificationHandler<SavedItemRemovedEvent>
{
    public Task Handle(SavedItemCreatedEvent notification, CancellationToken cancellationToken)
        => UpdateCount(notification.TargetId, notification.TargetType, true, cancellationToken);

    public Task Handle(SavedItemRemovedEvent notification, CancellationToken cancellationToken)
        => UpdateCount(notification.TargetId, notification.TargetType, false, cancellationToken);

    private async Task UpdateCount(Guid targetId, SavedItemTargetType type, bool isIncrement, CancellationToken ct)
    {
        if (type == SavedItemTargetType.Post)
        {
            var post = await postRepository.GetByIdAsync(new PostId(targetId), ct);
            if (post is null) return;

            if (isIncrement)
                post.IncrementSavedCount();
            else
                post.DecrementSavedCount();

            postRepository.Update(post);
        }
        else if (type == SavedItemTargetType.Comment)
        {
            var comment = await commentRepository.GetByIdAsync(new CommentId(targetId), ct);
            if (comment is null) return;

            if (isIncrement)
                comment.IncrementSavedCount();
            else
                comment.DecrementSavedCount();

            commentRepository.Update(comment);
        }
    }
}
