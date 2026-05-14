using MediatR;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class UpdateFollowCountsWhenUnfollowedEventHandler(
    IUserRepository userRepository) : INotificationHandler<UserUnfollowedEvent>
{
    public async Task Handle(UserUnfollowedEvent notification, CancellationToken cancellationToken)
    {
        var observer = await userRepository.GetByIdAsync(notification.ObserverId, cancellationToken);
        var target = await userRepository.GetByIdAsync(notification.TargetId, cancellationToken);

        if (observer is not null)
        {
            observer.DecrementFollowing();
            userRepository.Update(observer);
        }

        if (target is not null)
        {
            target.DecrementFollowers();
            userRepository.Update(target);
        }
    }
}
