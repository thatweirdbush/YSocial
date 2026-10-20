using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.UserRelations.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserRelations;

public class UserRelation : AggregateRoot<UserRelationId>, ISoftDeletable
{
    public UserId ObserverId { get; private set; }
    public UserId TargetId { get; private set; }
    public FollowStatus FollowStatus { get; private set; }
    public bool IsCloseFriend { get; private set; }
    public bool IsMuted { get; private set; }
    public DateTime? MutedAt { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? UpdatedAt { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

#pragma warning disable CS8618
    private UserRelation() { }
#pragma warning restore CS8618

    private UserRelation(UserId observerId, UserId targetId)
    {
        Id = UserRelationId.New();
        ObserverId = observerId;
        TargetId = targetId;
        FollowStatus = FollowStatus.None;
        IsCloseFriend = false;
        IsMuted = false;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
    }

    public static UserRelation Create(UserId observerId, UserId targetId)
    {
        return new UserRelation(observerId, targetId);
    }

    public void RequestFollow(bool isTargetPrivate)
    {
        if (!IsDeleted && (FollowStatus == FollowStatus.Accepted || FollowStatus == FollowStatus.Pending))
        {
            return; // Idempotent: fail silently if already active
        }

        if (IsDeleted)
        {
            // Restore logic
            IsDeleted = false;
            DeletedAt = null;
        }

        if (isTargetPrivate)
        {
            FollowStatus = FollowStatus.Pending;
            AddDomainEvent(new UserFollowRequestedEvent(Id, ObserverId, TargetId));
        }
        else
        {
            FollowStatus = FollowStatus.Accepted;
            AddDomainEvent(new UserFollowAcceptedEvent(Id, ObserverId, TargetId));
        }
        UpdatedAt = DateTime.UtcNow;
    }

    public void AcceptFollow()
    {
        if (FollowStatus == FollowStatus.Accepted) return;

        FollowStatus = FollowStatus.Accepted;
        UpdatedAt = DateTime.UtcNow;
        AddDomainEvent(new UserFollowAcceptedEvent(Id, ObserverId, TargetId, FromRequest: true));
    }

    public void ToggleCloseFriend(bool isCloseFriend)
    {
        if (FollowStatus != FollowStatus.Accepted) return; // Can only be close friend if following
        IsCloseFriend = isCloseFriend;
        UpdatedAt = DateTime.UtcNow;
    }

    /// <summary>
    /// Idempotent. Never touches <see cref="UpdatedAt"/> (follow lists order by it) nor the follow state or deletion flag.
    /// </summary>
    public void SetMuted(bool isMuted)
    {
        if (IsMuted == isMuted) return;

        IsMuted = isMuted;
        MutedAt = isMuted ? DateTime.UtcNow : null;
    }

    public void Delete()
    {
        if (IsDeleted) return;

        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;

        var wasAccepted = FollowStatus == FollowStatus.Accepted;
        if (wasAccepted)
        {
            AddDomainEvent(new UserUnfollowedEvent(ObserverId, TargetId));
        }
    }
}
