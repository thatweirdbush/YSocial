using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data;

public class MockUserBlockRepository : IUserBlockRepository
{
    private readonly ConcurrentDictionary<UserBlockId, UserBlock> _blocks = MockDataStore.UserBlocks;

    public IUnitOfWork UnitOfWork => null!;

    public Task<UserBlock?> GetByIdAsync(UserBlockId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<UserBlock?> GetByIdAsync(UserBlockId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _blocks.TryGetValue(id, out var block);

        // UserBlock doesn't have IsDeleted flag currently, so just return it
        return Task.FromResult(block);
    }

    public async Task<bool> IsBlockedAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
    {
        var block = await GetBlockAsync(observerId, targetId, cancellationToken);
        return block is not null;
    }

    public  Task<UserBlock?> GetBlockAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
    {
        var block = _blocks.Values
            .FirstOrDefault(b => b.ObserverId == observerId && b.TargetId == targetId);

        return Task.FromResult(block);
    }

    public Task<(UserBlock? User1BlockedUser2, UserBlock? User2BlockedUser1)> GetBlocksBetweenAsync(UserId user1Id, UserId user2Id, CancellationToken cancellationToken = default)
    {
        var blocks = _blocks.Values
            //.AsNoTracking() // EF Core specific, can be ignored in this in-memory implementation
            .Where(b => (b.ObserverId == user1Id && b.TargetId == user2Id) || 
                        (b.ObserverId == user2Id && b.TargetId == user1Id))
            .ToList();

        var user1BlockedUser2 = blocks.FirstOrDefault(b => b.ObserverId == user1Id && b.TargetId == user2Id);
        var user2BlockedUser1 = blocks.FirstOrDefault(b => b.ObserverId == user2Id && b.TargetId == user1Id);

        return Task.FromResult((user1BlockedUser2, user2BlockedUser1));
    }

    public Task<IReadOnlySet<UserId>> GetBlockedEitherWayAsync(UserId userId, IReadOnlyCollection<UserId> candidateIds, CancellationToken cancellationToken = default)
    {
        var candidates = candidateIds.ToHashSet();
        var blocked = new HashSet<UserId>();

        foreach (var block in _blocks.Values)
        {
            if (block.ObserverId == userId && candidates.Contains(block.TargetId)) blocked.Add(block.TargetId);
            else if (block.TargetId == userId && candidates.Contains(block.ObserverId)) blocked.Add(block.ObserverId);
        }

        return Task.FromResult<IReadOnlySet<UserId>>(blocked);
    }

    public Task AddAsync(UserBlock entity, CancellationToken cancellationToken = default)
    {
        _blocks.TryAdd(entity.Id, entity);
        return Task.CompletedTask;
    }

    public void Update(UserBlock entity)
    {
        _blocks.AddOrUpdate(entity.Id, entity, (_, _) => entity);
    }

    public void Remove(UserBlock entity)
    {
        MockDataStore.CaptureRemovedEvents(entity);
        _blocks.TryRemove(entity.Id, out _);
    }
}
