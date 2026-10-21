using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Features.Access;
using YSocial.Application.Features.Users.Projection;
using YSocial.Application.Models;
using YSocial.Application.Models.Commons;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Users.GetSuggestedUsers;

/// <summary>
/// Who to follow (D32). Candidates pass the access filter and exclude the viewer, their other profiles, anyone already followed,
/// requested or muted. Score = 10 * mutuals + min(followers, 50); ties: newest user, then id ascending. Anonymous allowed (no mutuals).
/// </summary>
public sealed record GetSuggestedUsersQuery(int Page = 1, int PageSize = GetSuggestedUsersQuery.DefaultPageSize)
    : ResultQuery<PagedResponse<UserProfileDto>>
{
    public const int DefaultPageSize = 5;
}

internal sealed class GetSuggestedUsersQueryValidator : AbstractValidator<GetSuggestedUsersQuery>
{
    public GetSuggestedUsersQueryValidator()
    {
        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }
}

internal sealed class GetSuggestedUsersQueryHandler(
    IUserRepository userRepository,
    IUserRelationRepository relationRepository,
    IViewerAccessPolicy accessPolicy,
    UserProfileProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetSuggestedUsersQuery, Result<PagedResponse<UserProfileDto>>>
{
    private const int FollowerCap = 50;
    private const int MutualWeight = 10;

    public async Task<Result<PagedResponse<UserProfileDto>>> Handle(GetSuggestedUsersQuery request, CancellationToken cancellationToken)
    {
        var viewerId = userContext.GetViewerId();

        // DEBT (BG 10): every active profile & accepted edge is scored in memory
        var users = await userRepository.GetAllActiveAsync(cancellationToken);
        var userIds = users.Select(u => u.Id).ToList();
        var context = await accessPolicy.GetContextAsync(viewerId, userIds, cancellationToken);
        var edges = await relationRepository.GetAcceptedEdgesAsync(userIds, cancellationToken);

        var excluded = new HashSet<UserId>();
        var followees = new HashSet<UserId>();
        AccountIdOrNull(users, viewerId, out var viewerAccount);

        if (viewerId is { } viewer)
        {
            // Edges include soft-deleted ones: a mute survives unfollow
            foreach (var edge in await relationRepository.GetByObserverAsync(viewer, cancellationToken))
            {
                if (edge.IsMuted) excluded.Add(edge.TargetId);
                if (edge.IsDeleted) continue;

                if (edge.FollowStatus == FollowStatus.Accepted) followees.Add(edge.TargetId);
                if (edge.FollowStatus != FollowStatus.None) excluded.Add(edge.TargetId);
            }
        }

        var candidates = users
            .Where(u => u.Id != viewerId
                        && (viewerAccount is null || u.AccountId != viewerAccount)
                        && !excluded.Contains(u.Id)
                        && context.IsUserAccessible(u))
            .Select(u => (User: u, Score: Score(u.Id, edges, followees, context)))
            .OrderByDescending(c => c.Score)
            .ThenByDescending(c => c.User.CreatedAt)
            .ThenBy(c => c.User.Id.Value)
            .Select(c => c.User)
            .ToList();

        var slice = PagedResponse<User>.Slice(candidates, request.Page, request.PageSize);
        var items = await projector.ProjectAsync(viewerId, slice, cancellationToken: cancellationToken);

        return Result<PagedResponse<UserProfileDto>>.Success(new PagedResponse<UserProfileDto>(items, request.Page, request.PageSize, candidates.Count));
    }

    private static int Score(UserId candidate, IReadOnlyList<UserRelation> edges, IReadOnlySet<UserId> followees, ViewerAccessContext context)
    {
        var followers = 0;
        var mutuals = 0;

        foreach (var edge in edges)
        {
            if (edge.TargetId != candidate || !context.IsDiscoverable(edge.ObserverId)) continue;

            followers++;
            if (followees.Contains(edge.ObserverId)) mutuals++;
        }

        return MutualWeight * mutuals + Math.Min(followers, FollowerCap);
    }

    private static void AccountIdOrNull(IReadOnlyList<User> users, UserId? viewerId, out Domain.Identities.AccountId? account)
        => account = viewerId is { } id ? users.FirstOrDefault(u => u.Id == id)?.AccountId : null;
}
