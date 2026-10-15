using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Access;

internal sealed class ViewerAccessPolicy(
    IUserRepository userRepository,
    IUserBlockRepository userBlockRepository,
    IUserRelationRepository userRelationRepository) : IViewerAccessPolicy
{
    public async Task<ViewerAccessContext> GetContextAsync(
        UserId? viewerId,
        IReadOnlyCollection<UserId> candidateUserIds,
        CancellationToken cancellationToken = default)
    {
        var candidates = candidateUserIds.Distinct().ToList();
        var userIds = viewerId is { } viewer ? candidates.Append(viewer).Distinct().ToList() : candidates;

        // 1 call per repo regardless of candidate count (no N+1); awaited sequentially (single DbContext safe)
        var users = (await userRepository.GetUsersByIdsAsync(userIds, cancellationToken)).ToDictionary(u => u.Id);

        IReadOnlySet<UserId> blocked = new HashSet<UserId>();
        var relations = new Dictionary<UserId, RelationSnapshot>();

        if (viewerId is { } viewerValue)
        {
            blocked = await userBlockRepository.GetBlockedEitherWayAsync(viewerValue, candidates, cancellationToken);

            foreach (var edge in await userRelationRepository.GetRelationsAsync(viewerValue, candidates, cancellationToken))
            {
                relations[edge.TargetId] = new RelationSnapshot(
                    edge.IsDeleted ? FollowStatus.None : edge.FollowStatus,
                    edge.IsCloseFriend,
                    edge.IsMuted);
            }
        }

        return new ViewerAccessContext(viewerId, users, blocked, relations);
    }
}
