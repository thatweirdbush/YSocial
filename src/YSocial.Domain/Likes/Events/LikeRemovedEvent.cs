using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes.Events;

public sealed record LikeRemovedEvent(LikeId LikeId, Guid TargetId, LikeTargetType TargetType, UserId UserId) : DomainEvent;
