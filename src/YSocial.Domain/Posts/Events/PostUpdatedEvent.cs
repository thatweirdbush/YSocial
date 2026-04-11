using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Posts.Events;

public sealed record PostUpdatedEvent(PostId PostId) : DomainEvent;
