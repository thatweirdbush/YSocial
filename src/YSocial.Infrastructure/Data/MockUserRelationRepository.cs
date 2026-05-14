using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data;

public class MockUserRelationRepository : IUserRelationRepository
{
    private readonly ConcurrentDictionary<UserRelationId, UserRelation> _relations = MockDataStore.UserRelations;

    public IUnitOfWork UnitOfWork => null!;

    public Task<UserRelation?> GetByIdAsync(UserRelationId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<UserRelation?> GetByIdAsync(UserRelationId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _relations.TryGetValue(id, out var relation);

        if (relation != null && relation.IsDeleted && !includeDeleted)
            return Task.FromResult<UserRelation?>(null);

        return Task.FromResult(relation);
    }

    public Task<UserRelation?> GetRelationAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
    {
        var relation = _relations.Values
            .WhereNotDeleted()
            .FirstOrDefault(r => r.ObserverId == observerId && r.TargetId == targetId);

        return Task.FromResult(relation);
    }

    public Task AddAsync(UserRelation entity, CancellationToken cancellationToken = default)
    {
        _relations.TryAdd(entity.Id, entity);
        return Task.CompletedTask;
    }

    public void Update(UserRelation entity)
    {
        _relations.AddOrUpdate(entity.Id, entity, (_, _) => entity);
    }

    public void Remove(UserRelation entity)
    {
        _relations[entity.Id] = entity;
    }
}
