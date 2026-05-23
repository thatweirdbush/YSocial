using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes.Events;

public sealed record LikeCreatedEvent(
    LikeId LikeId,
    Guid TargetId,
    LikeTargetType TargetType,
    UserId LikerId,
    UserId TargetAuthorId) : DomainEvent;
