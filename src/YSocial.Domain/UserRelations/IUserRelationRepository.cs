using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserRelations;

public interface IUserRelationRepository : IRepository<UserRelation, UserRelationId>
{
    Task<UserRelation?> GetRelationAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default);
    Task<UserRelation?> GetRelationAsync(UserId observerId, UserId targetId, bool includeDeleted, CancellationToken cancellationToken = default);

    /// <summary>
    /// Edges observer to targets INCLUDING soft-deleted ones (dormant close-friend/mute flags survive unfollow).
    /// </summary>
    Task<IReadOnlyList<UserRelation>> GetRelationsAsync(UserId observerId, IReadOnlyCollection<UserId> targetIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// Active accepted edges touching any of the users, both directions (read-time counters).
    /// </summary>
    Task<IReadOnlyList<UserRelation>> GetAcceptedEdgesAsync(IReadOnlyCollection<UserId> userIds, CancellationToken cancellationToken = default);
}
