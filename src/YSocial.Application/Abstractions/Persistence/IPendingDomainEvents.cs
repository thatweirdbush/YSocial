using Microservice.BuildingBlocks.Domain.Events;

namespace YSocial.Application.Abstractions.Persistence;

/// <summary>
/// Pending (undispatched) domain events of the current process.
/// </summary>
public interface IPendingDomainEvents
{
    /// <summary>
    /// Drops every pending event (used when a request failed) & returns what was dropped.
    /// </summary>
    IReadOnlyCollection<IDomainEvent> Discard();
}
