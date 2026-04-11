using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Users.Events;
public sealed record UserProfileCreatedEvent(UserId UserId, string Username) : DomainEvent;
