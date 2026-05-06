using MediatR;
using YSocial.Domain.Posts.Events;
using YSocial.Domain.SavedItems;

namespace YSocial.Application.Features.SavedItems.EventHandlers;

internal sealed class RemoveSavedItemsWhenPostDeletedEventHandler(
    ISavedItemRepository savedItemRepository)
    : INotificationHandler<PostDeletedEvent>
{
    public Task Handle(PostDeletedEvent notification, CancellationToken cancellationToken)
    {
        return savedItemRepository.RemoveByTargetAsync(notification.PostId.Value, SavedItemTargetType.Post, cancellationToken);
    }
}
