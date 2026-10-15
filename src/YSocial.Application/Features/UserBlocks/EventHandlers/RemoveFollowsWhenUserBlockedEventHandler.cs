using MediatR;
using YSocial.Domain.UserBlocks.Events;
using YSocial.Domain.UserRelations.Services;

namespace YSocial.Application.Features.UserBlocks.EventHandlers;

internal sealed class RemoveFollowsWhenUserBlockedEventHandler(
    UserRelationManager relationManager) : INotificationHandler<UserBlockedEvent>
{
    public async Task Handle(UserBlockedEvent notification, CancellationToken cancellationToken)
    {
        // When A blocks B, force A to unfollow B,
        // and force B to unfollow A
        await relationManager.UnfollowUserAsync(notification.ObserverId, notification.TargetId, cancellationToken);
        await relationManager.UnfollowUserAsync(notification.TargetId, notification.ObserverId, cancellationToken);
    }
}
