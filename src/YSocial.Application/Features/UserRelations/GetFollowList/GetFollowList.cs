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

namespace YSocial.Application.Features.UserRelations.GetFollowList;

/// <summary>
/// Accepted followers or followees of a user, newest edge first. Anonymous allowed.
/// Blocked either way / deleted / unknown = 404 (D14, D20); private and not permitted = 200 locked (D15).
/// </summary>
public sealed record GetFollowListQuery(Guid UserId, bool Followers, int Page = 1, int PageSize = 20, string? Query = null) : ResultQuery<FollowListPageDto>;

internal sealed class GetFollowListQueryValidator : AbstractValidator<GetFollowListQuery>
{
    public GetFollowListQueryValidator()
    {
        RuleFor(x => x.UserId).NotEmpty();

        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();

        RuleFor(x => x.Query).MustBeValidRelationQuery();
    }
}

internal sealed class GetFollowListQueryHandler(
    IUserRepository userRepository,
    IUserRelationRepository relationRepository,
    IViewerAccessPolicy accessPolicy,
    UserProfileProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetFollowListQuery, Result<FollowListPageDto>>
{
    public async Task<Result<FollowListPageDto>> Handle(GetFollowListQuery request, CancellationToken cancellationToken)
    {
        var viewerId = userContext.GetViewerId();
        var ownerId = new UserId(request.UserId);

        var owner = await userRepository.GetByIdAsync(ownerId, cancellationToken);
        var ownerContext = await accessPolicy.GetContextAsync(viewerId, [ownerId], cancellationToken);
        if (owner is null || !ownerContext.IsUserAccessible(owner))
        {
            return Result<FollowListPageDto>.NotFound("User not found.");
        }

        // Locked: counts stay visible on the profile, the list does not
        if (!ownerContext.CanViewContent(ownerId))
        {
            return Result<FollowListPageDto>.Success(new FollowListPageDto([], request.Page, request.PageSize, 0, Locked: true));
        }

        UserId OtherOf(UserRelation edge) => request.Followers ? edge.ObserverId : edge.TargetId;

        var edges = (await relationRepository.GetAcceptedEdgesAsync([ownerId], cancellationToken))
            .Where(e => request.Followers ? e.TargetId == ownerId : e.ObserverId == ownerId)
            .ToList();

        var otherIds = edges.Select(OtherOf).Distinct().ToList();
        var users = await userRepository.GetUsersByIdsAsync(otherIds, cancellationToken);
        var context = await accessPolicy.GetContextAsync(viewerId, otherIds, cancellationToken);

        // Access filter, then search, then count & page
        var matched = RelationSearch.Filter(context.FilterUsers(users), request.Query);
        var edgeByUser = edges.ToDictionary(OtherOf);

        var ordered = matched
            .OrderByDescending(u => edgeByUser[u.Id].UpdatedAt ?? edgeByUser[u.Id].CreatedAt)
            .ThenBy(u => u.Id.Value)
            .ToList();

        var slice = PagedResponse<UserProfileDto>.Slice(ordered, request.Page, request.PageSize);
        var items = await projector.ProjectAsync(viewerId, slice, cancellationToken: cancellationToken);

        return Result<FollowListPageDto>.Success(new FollowListPageDto(items, request.Page, request.PageSize, ordered.Count, Locked: false));
    }
}
