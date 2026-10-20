using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Application.Abstractions.Persistence;

namespace YSocial.Infrastructure.Persistence.UnitOfWork;

public partial class UnitOfWork(IDataStorage dataStorage, IDomainEventsDispatcher domainEventsDispatcher) : IUnitOfWork
{
    /// <summary>
    /// Dispatches domain events FIRST (handlers change data that must be saved together with the handler's changes),
    /// then saves everything in 1 database transaction.
    /// </summary>
    public async Task<int> CommitAsync(CancellationToken cancellationToken = default)
    {
        await domainEventsDispatcher.DispatchEventsAsync(cancellationToken);

        try
        {
            return await dataStorage.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateConcurrencyException exception)
        {
            throw new ConcurrencyConflictException("The data was changed by another request.", exception);
        }
    }
}
