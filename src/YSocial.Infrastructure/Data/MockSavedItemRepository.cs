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
        _savedItems.TryRemove(entity.Id, out _);
    }

    public Task<SavedItem?> GetByIdAsync(SavedItemId id, CancellationToken cancellationToken = default)
    {
        _savedItems.TryGetValue(id, out var savedItem);
        return Task.FromResult(savedItem);
    }

    public Task<SavedItem?> GetByUserAndTargetAsync(UserId userId, Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var savedItem = _savedItems.Values.FirstOrDefault(l => l.UserId == userId && l.TargetId == targetId && l.TargetType == targetType);
        return Task.FromResult(savedItem);
    }

    public Task<List<SavedItem>> GetSavedItemsByUserAsync(UserId userId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var items = _savedItems.Values
            .Where(l => l.UserId == userId && l.TargetType == targetType)
            .OrderByDescending(l => l.CreatedAt)
            .ToList();
            
        return Task.FromResult(items);
    }

    public Task RemoveByTargetAsync(Guid targetId, SavedItemTargetType targetType, CancellationToken cancellationToken = default)
    {
        var keysToRemove = _savedItems.Values
            .Where(x => x.TargetId == targetId && x.TargetType == targetType)
            .Select(x => x.Id)
            .ToList();

        foreach (var key in keysToRemove)
        {
            _savedItems.TryRemove(key, out _);
        }

        return Task.CompletedTask;
    }

    public void Update(SavedItem entity)
    {
        _savedItems[entity.Id] = entity;
    }
}
