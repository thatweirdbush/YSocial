using YSocial.Application.Features.Access;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserRelations.GetFollowRequests;

/// <summary>
/// Pending requests addressed to the viewer whose requester passes the access policy (shared by the list, the count and relation sets).
/// </summary>
internal sealed class AccessibleFollowRequests(
    IUserRepository userRepository,
    IUserRelationRepository relationRepository,
    IViewerAccessPolicy accessPolicy)
{
    public async Task<IReadOnlyList<(User User, UserRelation Edge)>> LoadAsync(UserId viewerId, CancellationToken cancellationToken)
    {
        var edges = await relationRepository.GetPendingRequestsAsync(viewerId, cancellationToken);
        var requesterIds = edges.Select(e => e.ObserverId).Distinct().ToList();

        var users = await userRepository.GetUsersByIdsAsync(requesterIds, cancellationToken);
        var context = await accessPolicy.GetContextAsync(viewerId, requesterIds, cancellationToken);
        var accessible = context.FilterUsers(users).ToDictionary(u => u.Id);

        return edges
            .Where(e => accessible.ContainsKey(e.ObserverId))
            .Select(e => (accessible[e.ObserverId], e))
            .ToList();
    }
}
