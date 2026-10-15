using MediatR;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.Extensions.Logging;

namespace YSocial.Infrastructure.Messaging.DomainEventsDispatching;

/// <inheritdoc cref="IDomainEventsDispatcher"/>
/// <remarks>
/// Drain -> publish until no event is pending (handlers may raise new events), bounded by <see cref="MaxPasses"/>.
/// A failure discards everything still pending (never re-queued) so nothing leaks into later requests.
/// </remarks>
public sealed class DomainEventsDispatcher(
    IMediator mediator,
    IDomainEventsProvider domainEventsProvider,
    ILogger<DomainEventsDispatcher> logger) : IDomainEventsDispatcher
{
    public const int MaxPasses = 5;

    public async Task DispatchEventsAsync(CancellationToken cancellationToken)
    {
        for (var pass = 1; pass <= MaxPasses; pass++)
        {
            var domainEvents = domainEventsProvider.DrainDomainEvents();
            if (domainEvents.Count == 0)
            {
                return;
            }

            var published = 0;
            try
            {
                foreach (var domainEvent in domainEvents)
                {
                    await mediator.Publish(domainEvent, cancellationToken);
                    published++;
                }
            }
            catch (Exception exception)
            {
                var dropped = domainEvents.Skip(published + 1).Concat(domainEventsProvider.DrainDomainEvents()).ToList();
                logger.LogError(exception, "Event dispatch failed on {Event}; discarded {Count} events: {EventTypes}",
                    domainEvents.ElementAt(published).GetType().Name, dropped.Count, string.Join(", ", dropped.Select(e => e.GetType().Name)));
                throw;
            }
        }

        var leftover = domainEventsProvider.DrainDomainEvents();
        if (leftover.Count > 0)
        {
            logger.LogError("Event dispatch exceeded {MaxPasses} passes; discarded {Count} events: {EventTypes}",
                MaxPasses, leftover.Count, string.Join(", ", leftover.Select(e => e.GetType().Name)));
            throw new InvalidOperationException($"Domain events kept re-triggering after {MaxPasses} dispatch passes.");
        }
    }
}
