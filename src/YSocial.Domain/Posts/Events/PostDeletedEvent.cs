using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Posts.Events;

public sealed record PostDeletedEvent(PostId PostId) : DomainEvent;
