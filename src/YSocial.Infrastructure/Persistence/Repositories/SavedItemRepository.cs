using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class SavedItemRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<SavedItem, SavedItemId>(db, unitOfWork), ISavedItemRepository
{
    public Task<SavedItem?> GetByUserAndTargetAsync(UserId userId, Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
        => Set.WhereNotDeleted()
            .FirstOrDefaultAsync(s => s.UserId == userId && s.TargetId == targetId && s.TargetType == targetType, cancellationToken);

    public async Task<IReadOnlySet<Guid>> GetSavedTargetIdsAsync(UserId userId, IReadOnlyCollection<Guid> targetIds, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var wanted = targetIds.Distinct().ToList();
        var saved = await Set.AsNoTracking()
            .Where(s => !s.IsDeleted && s.UserId == userId && s.TargetType == targetType && wanted.Contains(s.TargetId))
            .Select(s => s.TargetId)
            .ToListAsync(cancellationToken);

        return saved.ToHashSet();
    }

    public async Task<List<SavedItem>> GetSavedItemsByUserAsync(UserId userId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var items = await Set.WhereNotDeleted()
            .Where(s => s.UserId == userId && s.TargetType == targetType)
            .ToListAsync(cancellationToken);

        // Ordered client-side: provider-neutral (no DateTime ordering assumptions)
        return items.OrderByDescending(s => s.CreatedAt).ToList();
    }

    public async Task RemoveByTargetAsync(Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var items = await Set.WhereNotDeleted()
            .Where(s => s.TargetId == targetId && s.TargetType == targetType)
            .ToListAsync(cancellationToken);

        foreach (var item in items)
        {
            item.Remove();
        }
    }
}
