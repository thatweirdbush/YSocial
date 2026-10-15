using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.SavedItems;

public interface ISavedItemRepository : IRepository<SavedItem, SavedItemId>
{
    Task<SavedItem?> GetByUserAndTargetAsync(UserId userId, Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Subset of <paramref name="targetIds"/> the user has saved and not removed (single set-based query).
    /// </summary>
    Task<IReadOnlySet<Guid>> GetSavedTargetIdsAsync(UserId userId, IReadOnlyCollection<Guid> targetIds, SavedItemTargetType targetType, CancellationToken cancellationToken = default);
    Task<List<SavedItem>> GetSavedItemsByUserAsync(UserId userId, SavedItemTargetType targetType, CancellationToken cancellationToken = default);
    Task RemoveByTargetAsync(Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default);
}
