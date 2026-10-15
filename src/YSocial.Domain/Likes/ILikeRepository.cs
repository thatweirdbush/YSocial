using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes;

/// <summary>
/// Repository interface for Like aggregate root.
/// </summary>
public interface ILikeRepository : IRepository<Like, LikeId>
{
    Task<Like?> GetByUserAndTargetAsync(UserId userId, Guid targetId, LikeTargetType targetType, CancellationToken cancellationToken = default);

    /// <summary>
    /// Subset of <paramref name="targetIds"/> the user likes (single set-based query).
    /// </summary>
    Task<IReadOnlySet<Guid>> GetLikedTargetIdsAsync(UserId userId, IReadOnlyCollection<Guid> targetIds, LikeTargetType targetType, CancellationToken cancellationToken = default);
}
