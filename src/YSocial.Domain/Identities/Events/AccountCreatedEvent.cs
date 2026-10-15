using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Identities.Events;

public sealed record AccountCreatedEvent(AccountId AccountId, string Email, string Username) : DomainEvent;
