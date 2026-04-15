using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Repositories;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;

namespace YSocial.Infrastructure.Persistence.Repositories;

public abstract class RepositoryBase<T, TId, TDbContext>(TDbContext context)
    : IRepository<T, TId>
    where T : class, IAggregateRoot
    where TId : notnull
    where TDbContext : DbContext, IUnitOfWork
{
    public IUnitOfWork UnitOfWork => context;

    public virtual async Task<T?> GetByIdAsync(TId id, CancellationToken ct = default)
    {
        return await context.Set<T>().FindAsync([id], ct);
    }

    public virtual async Task AddAsync(T aggregate, CancellationToken ct = default)
    {
        await context.Set<T>().AddAsync(aggregate, ct);
    }

    public virtual void Update(T aggregate) => context.Set<T>().Update(aggregate);

    public virtual void Remove(T aggregate) => context.Set<T>().Remove(aggregate);
}
