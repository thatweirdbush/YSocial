using MediatR;
using YSocial.Application.Features.Notifications;
using YSocial.Domain.Notifications;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class CreateNotificationWhenFollowAcceptedEventHandler(
    IUserRepository userRepository,
    NotificationPublisher publisher) : INotificationHandler<UserFollowAcceptedEvent>
{
    public async Task Handle(UserFollowAcceptedEvent notification, CancellationToken cancellationToken)
    {
        var users = await userRepository.GetUsersByIdsAsync([notification.ObserverId, notification.TargetId], cancellationToken);

        var observer = users.FirstOrDefault(u => u.Id == notification.ObserverId);
        var target = users.FirstOrDefault(u => u.Id == notification.TargetId);

        if (observer is null || target is null) return;

        // An accepted request tells the requester; a plain follow of a public user tells the followed user
        if (notification.FromRequest)
        {
            await publisher.PublishAsync(
                observer.Id,
                target,
                NotificationType.FollowAccepted,
                "Follow Request Accepted",
                $"{target.Username} accepted your follow request.",
                target.Id.Value,
                cancellationToken);
            return;
        }

        await publisher.PublishAsync(
            target.Id,
            observer,
            NotificationType.NewFollow,
            "New Follower",
            $"{observer.Username} started following you.",
            observer.Id.Value,
            cancellationToken);
    }
}
