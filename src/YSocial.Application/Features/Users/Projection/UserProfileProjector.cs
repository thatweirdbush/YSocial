using YSocial.Application.Features.Access;
using YSocial.Application.Models;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.Projection;

/// <summary>
/// Batch projector of <see cref="UserProfileDto"/>: fixed repo calls for N profiles (edges + one policy context),
/// counters computed on read with the SAME access filter as the lists (D14, §4.4). Stored counters are never exposed.
/// </summary>
internal sealed class UserProfileProjector(IViewerAccessPolicy accessPolicy, IUserRelationRepository relationRepository)
{
    /// <summary>
    /// Projects the accessible users only (blocked either way / deleted are dropped), keeping input order.
    /// </summary>
    /// <param name="markAsBlocked">Set only for the viewer's own block list.</param>
    public async Task<IReadOnlyList<UserProfileDto>> ProjectAsync(
        UserId? viewerId,
        IReadOnlyCollection<User> users,
        bool markAsBlocked = false,
        CancellationToken cancellationToken = default)
    {
        if (users.Count == 0)
        {
            return [];
        }

        var userIds = users.Select(u => u.Id).ToList();
        var edges = await relationRepository.GetAcceptedEdgesAsync(userIds, cancellationToken);

        var candidates = userIds
            .Concat(edges.SelectMany(e => new[] { e.ObserverId, e.TargetId }))
            .Distinct()
            .ToList();
        var context = await accessPolicy.GetContextAsync(viewerId, candidates, cancellationToken);

        // markAsBlocked lists are the one exception where blocked users stay visible
        var visible = users.Where(u => markAsBlocked || context.IsUserAccessible(u)).ToList();

        return visible.Select(user => Project(user, edges, context, markAsBlocked)).ToList();
    }

    private static UserProfileDto Project(User user, IReadOnlyList<UserRelation> edges, ViewerAccessContext context, bool markAsBlocked)
    {
        var followers = edges.Count(e => e.TargetId == user.Id && context.IsDiscoverable(e.ObserverId));
        var following = edges.Count(e => e.ObserverId == user.Id && context.IsDiscoverable(e.TargetId));
        var relation = context.RelationTo(user.Id);
        var status = relation?.Status ?? FollowStatus.None;

        return new UserProfileDto(
            user.Id.Value,
            user.Username,
            user.ProfileInfo.DisplayName,
            user.ProfileInfo.Bio,
            user.ProfileInfo.AvatarUrl,
            user.ProfileInfo.CoverUrl,
            followers,
            following,
            user.PrivacySettings.IsPrivateProfile,
            IsVerified: false,
            ToCamel(status.Name),
            IsFollowing: status == FollowStatus.Accepted,
            ViewerMarkedCloseFriend: relation?.IsCloseFriend ?? false,
            IsMuted: relation?.IsMuted ?? false,
            IsBlocked: markAsBlocked,
            IsBlockedBy: false);
    }

    private static string ToCamel(string name) => char.ToLowerInvariant(name[0]) + name[1..];
}
