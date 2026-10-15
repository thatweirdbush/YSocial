using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Infrastructure.Messaging.DomainEventsDispatching;

public interface IDomainEventsProvider
{
    /// <summary>
    /// Atomically takes every pending event (oldest first) & clears them from their aggregates.
    /// </summary>
    IReadOnlyCollection<IDomainEvent> DrainDomainEvents();
}
