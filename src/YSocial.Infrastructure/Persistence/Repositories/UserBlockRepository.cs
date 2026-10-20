using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class UserBlockRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<UserBlock, UserBlockId>(db, unitOfWork), IUserBlockRepository
{
    public Task<bool> IsBlockedAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
        => Set.AnyAsync(b => b.ObserverId == observerId && b.TargetId == targetId, cancellationToken);

    public Task<UserBlock?> GetBlockAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
        => Set.FirstOrDefaultAsync(b => b.ObserverId == observerId && b.TargetId == targetId, cancellationToken);

    public async Task<(UserBlock? User1BlockedUser2, UserBlock? User2BlockedUser1)> GetBlocksBetweenAsync(UserId user1Id, UserId user2Id, CancellationToken cancellationToken = default)
    {
        var blocks = await Set
            .Where(b => (b.ObserverId == user1Id && b.TargetId == user2Id) || (b.ObserverId == user2Id && b.TargetId == user1Id))
            .ToListAsync(cancellationToken);

        return (blocks.FirstOrDefault(b => b.ObserverId == user1Id), blocks.FirstOrDefault(b => b.ObserverId == user2Id));
    }

    public async Task<IReadOnlyList<UserBlock>> GetByObserverAsync(UserId observerId, CancellationToken cancellationToken = default)
        => await Set.Where(b => b.ObserverId == observerId).ToListAsync(cancellationToken);

    public async Task<IReadOnlySet<UserId>> GetBlockedEitherWayAsync(UserId userId, IReadOnlyCollection<UserId> candidateIds, CancellationToken cancellationToken = default)
    {
        var candidates = candidateIds.Distinct().ToList();
        var edges = await Set.AsNoTracking()
            .Where(b => (b.ObserverId == userId && candidates.Contains(b.TargetId)) || (b.TargetId == userId && candidates.Contains(b.ObserverId)))
            .Select(b => new { b.ObserverId, b.TargetId })
            .ToListAsync(cancellationToken);

        return edges.Select(b => b.ObserverId == userId ? b.TargetId : b.ObserverId).ToHashSet();
    }
}
