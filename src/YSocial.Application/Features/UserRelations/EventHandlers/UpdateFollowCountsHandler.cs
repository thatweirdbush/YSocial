using MediatR;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.EventHandlers;

internal sealed class UpdateFollowCountsHandler(IUserRepository userRepository)
    : INotificationHandler<UserFollowAcceptedEvent>,
      INotificationHandler<UserUnfollowedEvent>
{
    public async Task Handle(UserFollowAcceptedEvent notification, CancellationToken cancellationToken)
    {
        await UpdateCounters(notification.ObserverId, notification.TargetId, isIncrement: true, cancellationToken);
    }

    public async Task Handle(UserUnfollowedEvent notification, CancellationToken cancellationToken)
    {
        await UpdateCounters(notification.ObserverId, notification.TargetId, isIncrement: false, cancellationToken);
    }

    private async Task UpdateCounters(UserId observerId, UserId targetId, bool isIncrement, CancellationToken cancellationToken)
    {
        var observerTask = userRepository.GetByIdAsync(observerId, cancellationToken);
        var targetTask = userRepository.GetByIdAsync(targetId, cancellationToken);

        await Task.WhenAll(observerTask, targetTask);

        var observer = await observerTask;
        var target = await targetTask;

        if (observer != null)
        {
            if (isIncrement) observer.IncrementFollowing();
            else observer.DecrementFollowing();

            userRepository.Update(observer);
        }

        if (target != null)
        {
            if (isIncrement) target.IncrementFollowers();
            else target.DecrementFollowers();

            userRepository.Update(target);
        }
    }
}