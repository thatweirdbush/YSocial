using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserBlocks;

public interface IUserBlockRepository : IRepository<UserBlock, UserBlockId>
{
    Task<bool> IsBlockedAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default);
    Task<UserBlock?> GetBlockAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default);
    Task<(UserBlock? User1BlockedUser2, UserBlock? User2BlockedUser1)> GetBlocksBetweenAsync(UserId user1Id, UserId user2Id, CancellationToken cancellationToken = default);

    /// <summary>
    /// Candidates that have a block with <paramref name="userId"/> in EITHER direction (single set-based query).
    /// </summary>
    Task<IReadOnlySet<UserId>> GetBlockedEitherWayAsync(UserId userId, IReadOnlyCollection<UserId> candidateIds, CancellationToken cancellationToken = default);
}
