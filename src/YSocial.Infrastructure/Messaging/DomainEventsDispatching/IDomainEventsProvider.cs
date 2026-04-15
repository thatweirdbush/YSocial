using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Infrastructure.Messaging.DomainEventsDispatching;

public interface IDomainEventsProvider
{
    IReadOnlyCollection<IDomainEvent> GetAllDomainEvents();
    void ClearAllDomainEvents();
}
