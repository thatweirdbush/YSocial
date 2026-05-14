using Microservice.BuildingBlocks.Domain.Events;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserBlocks.Events;

public sealed record UserBlockedEvent(
    UserBlockId BlockId,
    UserId ObserverId,
    UserId TargetId) : DomainEvent;
