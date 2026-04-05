using MediatR;
using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Infrastructure.Services.UnitOfWorks.DomainEventsDispatching;

/// <inheritdoc cref="IDomainEventsDispatcher"/>
public sealed class DomainEventsDispatcher(IMediator mediator, IDomainEventsProvider domainEventsProvider) : IDomainEventsDispatcher
{
    public async Task DispatchEventsAsync(CancellationToken cancellationToken)
    {
        var domainEvents = domainEventsProvider.GetAllDomainEvents();
        domainEventsProvider.ClearAllDomainEvents();

        foreach (var domainEvent in domainEvents)
        {
            await mediator.Publish(domainEvent, cancellationToken);
        }
    }
}