using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Identities.Events;

public sealed record AccountDeactivatedEvent(AccountId AccountId) : DomainEvent;
