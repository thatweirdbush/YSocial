using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;

namespace YSocial.Infrastructure.Persistence.UnitOfWork;

public partial class UnitOfWork(IDataStorage dataStorageDispatcher, IDomainEventsDispatcher domainEventsDispatcher) : IUnitOfWork
{
    public async Task<int> CommitAsync(CancellationToken cancellationToken = default)
    {
        // In Social Application, we need to dispatch domain events before saving the data,
        // because some of the domain events can cause changes in the data,
        // that should be saved together with the changes, that were made in the command handlers.

        await domainEventsDispatcher.DispatchEventsAsync(cancellationToken);

        var result = await dataStorageDispatcher.SaveChangesAsync(cancellationToken);

        return result;
    }
}
