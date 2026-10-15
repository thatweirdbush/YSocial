using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Likes;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data;

/// <summary>
/// In-memory implementation of ILikeRepository for mocking and rapid development.
/// </summary>
public class MockLikeRepository : ILikeRepository
{
    private readonly ConcurrentDictionary<LikeId, Like> _likes = MockDataStore.Likes;

    public IUnitOfWork UnitOfWork => null!;

    public Task<Like?> GetByIdAsync(LikeId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<Like?> GetByIdAsync(LikeId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _likes.TryGetValue(id, out var like);
        return Task.FromResult(like);
    }

    public Task<Like?> GetByUserAndTargetAsync(UserId userId, Guid targetId, LikeTargetType targetType, CancellationToken cancellationToken = default)
    {
        var like = _likes.Values.FirstOrDefault(l => l.UserId == userId && l.TargetId == targetId && l.TargetType == targetType);
        return Task.FromResult(like);
    }

    public Task<IReadOnlySet<Guid>> GetLikedTargetIdsAsync(UserId userId, IReadOnlyCollection<Guid> targetIds, LikeTargetType targetType, CancellationToken cancellationToken = default)
    {
        var wanted = targetIds.ToHashSet();
        var liked = _likes.Values
            .Where(l => l.UserId == userId && l.TargetType == targetType && wanted.Contains(l.TargetId))
            .Select(l => l.TargetId)
            .ToHashSet();

        return Task.FromResult<IReadOnlySet<Guid>>(liked);
    }

    public Task AddAsync(Like like, CancellationToken cancellationToken = default)
    {
        _likes.TryAdd(like.Id, like);
        return Task.CompletedTask;
    }

    public void Update(Like like)
    {
        _likes.AddOrUpdate(like.Id, like, (_, _) => like);
    }

    public void Remove(Like like)
    {
        MockDataStore.CaptureRemovedEvents(like);
        _likes.TryRemove(like.Id, out _);
    }
}
