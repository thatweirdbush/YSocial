using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data;

public class MockSavedItemRepository : ISavedItemRepository
{
    private readonly ConcurrentDictionary<SavedItemId, SavedItem> _savedItems = MockDataStore.SavedItems;

    public IUnitOfWork UnitOfWork => null!;

    public Task AddAsync(SavedItem entity, CancellationToken cancellationToken = default)
    {
        _savedItems.TryAdd(entity.Id, entity);
        return Task.CompletedTask;
    }

    public void Remove(SavedItem entity)
    {
        _savedItems[entity.Id] = entity;
    }

    public Task<SavedItem?> GetByIdAsync(SavedItemId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<SavedItem?> GetByIdAsync(SavedItemId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _savedItems.TryGetValue(id, out var savedItem);

        if (savedItem != null && savedItem.IsDeleted && !includeDeleted)
            return Task.FromResult<SavedItem?>(null);

        return Task.FromResult(savedItem);
    }

    public Task<SavedItem?> GetByUserAndTargetAsync(UserId userId, Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var savedItem = _savedItems.Values
            .WhereNotDeleted()
            .FirstOrDefault(l => l.UserId == userId && l.TargetId == targetId && l.TargetType == targetType);

        return Task.FromResult(savedItem);
    }

    public Task<IReadOnlySet<Guid>> GetSavedTargetIdsAsync(UserId userId, IReadOnlyCollection<Guid> targetIds, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var wanted = targetIds.ToHashSet();
        var saved = _savedItems.Values
            .Where(s => !s.IsDeleted && s.UserId == userId && s.TargetType == targetType && wanted.Contains(s.TargetId))
            .Select(s => s.TargetId)
            .ToHashSet();

        return Task.FromResult<IReadOnlySet<Guid>>(saved);
    }

    public Task<List<SavedItem>> GetSavedItemsByUserAsync(UserId userId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var items = _savedItems.Values
            .WhereNotDeleted()
            .Where(l => l.UserId == userId && l.TargetType == targetType)
            .OrderByDescending(l => l.CreatedAt)
            .ToList();

        return Task.FromResult(items);
    }

    public Task RemoveByTargetAsync(Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var itemsToRemove = _savedItems.Values
            .WhereNotDeleted()
            .Where(x => x.TargetId == targetId && x.TargetType == targetType)
            .ToList();

        foreach (var item in itemsToRemove)
        {
            item.Remove();
            _savedItems[item.Id] = item;
        }

        return Task.CompletedTask;
    }

    public void Update(SavedItem entity)
    {
        _savedItems[entity.Id] = entity;
    }
}
