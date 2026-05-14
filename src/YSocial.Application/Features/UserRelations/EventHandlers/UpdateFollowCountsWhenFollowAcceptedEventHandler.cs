using MediatR;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class UpdateFollowCountsWhenFollowAcceptedEventHandler(
    IUserRepository userRepository) : INotificationHandler<UserFollowAcceptedEvent>
{
    public async Task Handle(UserFollowAcceptedEvent notification, CancellationToken cancellationToken)
    {
        var observer = await userRepository.GetByIdAsync(notification.ObserverId, cancellationToken);
        var target = await userRepository.GetByIdAsync(notification.TargetId, cancellationToken);

        if (observer is not null)
        {
            observer.IncrementFollowing();
            userRepository.Update(observer);
        }

        if (target is not null)
        {
            target.IncrementFollowers();
            userRepository.Update(target);
        }
    }
}
