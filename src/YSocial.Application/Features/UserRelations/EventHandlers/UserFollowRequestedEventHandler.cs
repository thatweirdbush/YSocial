using MediatR;
using YSocial.Domain.UserRelations.Events;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class UserFollowRequestedEventHandler(
    /*INotificationService notificationService,
    IUserCounterCache service*/) : INotificationHandler<UserFollowRequestedEvent>
{
    public async Task Handle(UserFollowRequestedEvent notification, CancellationToken cancellationToken)
    {
        //// 1. Send Push Notifications to the person being followed (Target)
        //await notificationService.SendAsync(
        //    recipientId: notification.TargetId,
        //    title: "New Follow Request",
        //    message: "Someone wants to follow you.",
        //    data: new { notification.ObserverId, Type = "FollowRequest" },
        //    cancellationToken: cancellationToken);

        //// 2. Update Badge Count for the notifications/requests tab
        //await service.IncrementPendingRequestCountAsync(notification.TargetId, cancellationToken);
    }
}
