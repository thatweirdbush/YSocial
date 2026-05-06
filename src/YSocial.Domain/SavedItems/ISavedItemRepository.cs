using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.SavedItems;

public interface ISavedItemRepository : IRepository<SavedItem, SavedItemId>
{
    Task<SavedItem?> GetByUserAndTargetAsync(UserId userId, Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default);
    Task<List<SavedItem>> GetSavedItemsByUserAsync(UserId userId, SavedItemTargetType targetType, CancellationToken cancellationToken = default);
    Task RemoveByTargetAsync(Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default);
}
