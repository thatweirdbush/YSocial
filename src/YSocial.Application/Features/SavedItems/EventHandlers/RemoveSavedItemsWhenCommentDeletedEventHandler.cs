using MediatR;
using YSocial.Domain.Comments.Events;
using YSocial.Domain.SavedItems;

namespace YSocial.Application.Features.SavedItems.EventHandlers;

internal sealed class RemoveSavedItemsWhenCommentDeletedEventHandler(
    ISavedItemRepository savedItemRepository)
    : INotificationHandler<CommentDeletedEvent>
{
    public Task Handle(CommentDeletedEvent notification, CancellationToken cancellationToken)
    {
        return savedItemRepository.RemoveByTargetAsync(notification.CommentId.Value, SavedItemTargetType.Comment, cancellationToken);
    }
}
