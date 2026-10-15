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
        => GetRelationAsync(observerId, targetId, false, cancellationToken);

    public Task<UserRelation?> GetRelationAsync(UserId observerId, UserId targetId, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        var relation = _relations.Values
            .FirstOrDefault(r => r.ObserverId == observerId && r.TargetId == targetId);

        if (relation != null && relation.IsDeleted && !includeDeleted)
            return Task.FromResult<UserRelation?>(null);

        return Task.FromResult(relation);
    }

    public Task<IReadOnlyList<UserRelation>> GetRelationsAsync(UserId observerId, IReadOnlyCollection<UserId> targetIds, CancellationToken cancellationToken = default)
    {
        var targets = targetIds.ToHashSet();
        var relations = _relations.Values
            .Where(r => r.ObserverId == observerId && targets.Contains(r.TargetId))
            .ToList();

        return Task.FromResult<IReadOnlyList<UserRelation>>(relations);
    }

    public Task<IReadOnlyList<UserRelation>> GetByObserverAsync(UserId observerId, CancellationToken cancellationToken = default)
    {
        var relations = _relations.Values.Where(r => r.ObserverId == observerId).ToList();

        return Task.FromResult<IReadOnlyList<UserRelation>>(relations);
    }

    public Task<IReadOnlyList<UserRelation>> GetAcceptedEdgesAsync(IReadOnlyCollection<UserId> userIds, CancellationToken cancellationToken = default)
    {
        var users = userIds.ToHashSet();
        var edges = _relations.Values
            .Where(r => !r.IsDeleted && r.FollowStatus == FollowStatus.Accepted
                        && (users.Contains(r.ObserverId) || users.Contains(r.TargetId)))
            .ToList();

        return Task.FromResult<IReadOnlyList<UserRelation>>(edges);
    }

    public Task<IReadOnlyList<UserRelation>> GetPendingRequestsAsync(UserId targetId, CancellationToken cancellationToken = default)
    {
        var requests = _relations.Values
            .Where(r => !r.IsDeleted && r.FollowStatus == FollowStatus.Pending && r.TargetId == targetId)
            .ToList();

        return Task.FromResult<IReadOnlyList<UserRelation>>(requests);
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
