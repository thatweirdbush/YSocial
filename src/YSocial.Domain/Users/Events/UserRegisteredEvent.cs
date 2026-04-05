using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Users.Events;
public sealed record UserRegisteredEvent(UserId UserId, string Email) : DomainEvent;
