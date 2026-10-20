using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.Repositories;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;

namespace YSocial.Infrastructure.Persistence.Repositories;

/// <summary>
/// Shared EF behavior of every aggregate repo.
/// Contract: aggregates are loaded TRACKED (handlers mutate them &amp; the unit of work saves)
/// </summary>
internal abstract class RepositoryBase<T, TId>(YSocialDbContext db, IUnitOfWork unitOfWork) : IRepository<T, TId>
    where T : class, IAggregateRoot
    where TId : notnull
{
    protected YSocialDbContext Db { get; } = db;

    protected DbSet<T> Set => Db.Set<T>();

    public IUnitOfWork UnitOfWork => unitOfWork;

    public Task<T?> GetByIdAsync(TId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public virtual async Task<T?> GetByIdAsync(TId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        var entity = await Set.FindAsync([id], cancellationToken);

        return entity is ISoftDeletable { IsDeleted: true } && !includeDeleted ? null : entity;
    }

    public virtual async Task AddAsync(T entity, CancellationToken cancellationToken = default)
        => await Set.AddAsync(entity, cancellationToken);

    /// <summary>
    /// Tracked entities already carry their changes; only detached ones need attaching.
    /// </summary>
    public virtual void Update(T entity)
    {
        if (Db.Entry(entity).State == EntityState.Detached)
        {
            Set.Update(entity);
        }
    }

    /// <summary>
    /// Soft-deletable aggregates are deleted by their domain method (a tracked change): nothing to do here.
    /// Others are removed for real.
    /// </summary>
    public virtual void Remove(T entity)
    {
        if (entity is ISoftDeletable)
        {
            Update(entity);
            return;
        }

        Set.Remove(entity);
    }
}
