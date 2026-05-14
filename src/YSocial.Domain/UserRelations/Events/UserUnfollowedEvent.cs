using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserRelations.Events;

public sealed record UserUnfollowedEvent(UserId ObserverId, UserId TargetId) : DomainEvent;
