using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserRelations.Events;

public sealed record UserFollowAcceptedEvent(
    UserRelationId RelationId,
    UserId ObserverId,
    UserId TargetId,
    bool FromRequest = false) : DomainEvent;
