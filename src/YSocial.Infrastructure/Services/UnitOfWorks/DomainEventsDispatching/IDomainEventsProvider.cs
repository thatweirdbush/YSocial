using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Infrastructure.Services.UnitOfWorks.DomainEventsDispatching;

public interface IDomainEventsProvider
{
    IReadOnlyCollection<IDomainEvent> GetAllDomainEvents();
    void ClearAllDomainEvents();
}
