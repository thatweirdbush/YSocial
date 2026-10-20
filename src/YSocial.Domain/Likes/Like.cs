using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Likes.Events;
using YSocial.Domain.Likes.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes;

public sealed class Like : AggregateRoot<LikeId>
{
    public Guid TargetId { get; private set; }
    public LikeTargetType TargetType { get; private set; }
    public UserId UserId { get; private set; }
    public DateTime CreatedAt { get; private set; }

#pragma warning disable CS8618
    private Like() { }
#pragma warning restore CS8618

    private Like(Guid targetId, LikeTargetType targetType, UserId userId)
    {
        Id = LikeId.New();
        TargetId = targetId;
        TargetType = targetType;
        UserId = userId;
        CreatedAt = DateTime.UtcNow;
    }

    public static Like Create(Guid targetId, LikeTargetType targetType, UserId likerId, UserId targetAuthorId)
    {
        CheckRule(new UserIdMustNotBeEmptyRule(likerId));

        var like = new Like(targetId, targetType, likerId);
        like.AddDomainEvent(new LikeCreatedEvent(like.Id, targetId, targetType, likerId, targetAuthorId));
        return like;
    }

    public void Remove()
    {
        AddDomainEvent(new LikeRemovedEvent(Id, TargetId, TargetType, UserId));
    }
}
