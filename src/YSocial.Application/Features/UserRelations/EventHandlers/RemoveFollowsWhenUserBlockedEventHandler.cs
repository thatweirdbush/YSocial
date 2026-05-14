using MediatR;
using YSocial.Domain.UserBlocks.Events;
using YSocial.Domain.UserRelations.Services;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class RemoveFollowsWhenUserBlockedEventHandler(
    UserRelationManager relationManager) : INotificationHandler<UserBlockedEvent>
{
    public async Task Handle(UserBlockedEvent notification, CancellationToken cancellationToken)
    {
        // When A blocks B, force A to unfollow B
        await relationManager.UnfollowUserAsync(notification.ObserverId, notification.TargetId, cancellationToken);
        
        // And force B to unfollow A
        await relationManager.UnfollowUserAsync(notification.TargetId, notification.ObserverId, cancellationToken);
    }
}
