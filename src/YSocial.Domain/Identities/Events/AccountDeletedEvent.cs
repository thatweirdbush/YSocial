using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Domain.Identities.Events;

public sealed record AccountDeletedEvent(AccountId AccountId) : DomainEvent;
