using MediatR;
using YSocial.Application.Features.Notifications;
using YSocial.Domain.Notifications;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class CreateNotificationWhenFollowRequestedEventHandler(
    IUserRepository userRepository,
    NotificationPublisher publisher) : INotificationHandler<UserFollowRequestedEvent>
{
    public async Task Handle(UserFollowRequestedEvent notification, CancellationToken cancellationToken)
    {
        var users = await userRepository.GetUsersByIdsAsync([notification.ObserverId, notification.TargetId], cancellationToken);

        var observer = users.FirstOrDefault(u => u.Id == notification.ObserverId);
        var target = users.FirstOrDefault(u => u.Id == notification.TargetId);

        if (observer is null || target is null) return;

        await publisher.PublishAsync(
            target.Id,
            observer,
            NotificationType.FollowRequested,
            "New Follow Request",
            $"{observer.Username} wants to follow you.",
            observer.Id.Value,
            cancellationToken);
    }
}
