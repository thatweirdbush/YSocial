using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Likes;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class LikeRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<Like, LikeId>(db, unitOfWork), ILikeRepository
{
    public Task<Like?> GetByUserAndTargetAsync(UserId userId, Guid targetId, LikeTargetType targetType, CancellationToken cancellationToken = default)
        => Set.FirstOrDefaultAsync(l => l.UserId == userId && l.TargetId == targetId && l.TargetType == targetType, cancellationToken);

    public async Task<IReadOnlySet<Guid>> GetLikedTargetIdsAsync(UserId userId, IReadOnlyCollection<Guid> targetIds, LikeTargetType targetType, CancellationToken cancellationToken = default)
    {
        var wanted = targetIds.Distinct().ToList();
        var liked = await Set.AsNoTracking()
            .Where(l => l.UserId == userId && l.TargetType == targetType && wanted.Contains(l.TargetId))
            .Select(l => l.TargetId)
            .ToListAsync(cancellationToken);

        return liked.ToHashSet();
    }
}
