using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Likes.Events;
using YSocial.Domain.Likes.Rules;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes;

public sealed class Like : AggregateRoot<LikeId>
{
    public PostId PostId { get; private set; }
    public UserId UserId { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private Like(PostId postId, UserId userId)
    {
        Id = LikeId.New();
        PostId = postId;
        UserId = userId;
        CreatedAt = DateTime.UtcNow;
    }

    public static Like Create(PostId postId, UserId userId)
    {
        CheckRule(new PostIdMustNotBeEmptyRule(postId));
        CheckRule(new UserIdMustNotBeEmptyRule(userId));

        var like = new Like(postId, userId);
        like.AddDomainEvent(new LikeCreatedEvent(like.Id, postId, userId));
        return like;
    }
}
