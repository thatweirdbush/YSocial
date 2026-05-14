using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.UserBlocks.Events;
using YSocial.Domain.UserBlocks.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserBlocks;

public class UserBlock : AggregateRoot<UserBlockId>
{
    public UserId ObserverId { get; private set; }
    public UserId TargetId { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private UserBlock(UserId observerId, UserId targetId)
    {
        Id = UserBlockId.New();
        ObserverId = observerId;
        TargetId = targetId;
        CreatedAt = DateTime.UtcNow;
    }

    public static UserBlock Create(UserId observerId, UserId targetId)
    {
        CheckRule(new CannotBlockYourselfRule(observerId, targetId));

        var userBlock = new UserBlock(observerId, targetId);
        userBlock.AddDomainEvent(new UserBlockedEvent(userBlock.Id, observerId, targetId));

        return userBlock;
    }

    public void Unblock()
    {
        AddDomainEvent(new UserUnblockedEvent(ObserverId, TargetId));
    }
}
