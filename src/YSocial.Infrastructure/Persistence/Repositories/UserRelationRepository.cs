using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class UserRelationRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<UserRelation, UserRelationId>(db, unitOfWork), IUserRelationRepository
{
    public Task<UserRelation?> GetRelationAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
        => GetRelationAsync(observerId, targetId, false, cancellationToken);

    public async Task<UserRelation?> GetRelationAsync(UserId observerId, UserId targetId, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        var relation = await Set.FirstOrDefaultAsync(r => r.ObserverId == observerId && r.TargetId == targetId, cancellationToken);

        return relation is { IsDeleted: true } && !includeDeleted ? null : relation;
    }

    public async Task<IReadOnlyList<UserRelation>> GetRelationsAsync(UserId observerId, IReadOnlyCollection<UserId> targetIds, CancellationToken cancellationToken = default)
    {
        var targets = targetIds.Distinct().ToList();
        return await Set.Where(r => r.ObserverId == observerId && targets.Contains(r.TargetId)).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<UserRelation>> GetByObserverAsync(UserId observerId, CancellationToken cancellationToken = default)
        => await Set.Where(r => r.ObserverId == observerId).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<UserRelation>> GetAcceptedEdgesAsync(IReadOnlyCollection<UserId> userIds, CancellationToken cancellationToken = default)
    {
        var users = userIds.Distinct().ToList();
        return await Set
            .Where(r => !r.IsDeleted && r.FollowStatus == FollowStatus.Accepted
                        && (users.Contains(r.ObserverId) || users.Contains(r.TargetId)))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<UserRelation>> GetPendingRequestsAsync(UserId targetId, CancellationToken cancellationToken = default)
        => await Set
            .Where(r => !r.IsDeleted && r.FollowStatus == FollowStatus.Pending && r.TargetId == targetId)
            .ToListAsync(cancellationToken);
}
