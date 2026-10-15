using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Features.Users.Projection;
using YSocial.Application.Models;
using YSocial.Application.Models.Commons;

namespace YSocial.Application.Features.UserRelations.GetFollowRequests;

/// <summary>
/// Pending requests addressed to the viewer, newest first (edge UpdatedAt desc, tie-break requester id),
/// requesters filtered by the access policy BEFORE searching, counting and paging.
/// </summary>
public sealed record GetFollowRequestsQuery(int Page = 1, int PageSize = 20, string? Query = null) : ResultQuery<FollowListPageDto>;

public sealed record GetFollowRequestCountQuery : ResultQuery<FollowRequestCountDto>;

internal sealed class GetFollowRequestsQueryValidator : AbstractValidator<GetFollowRequestsQuery>
{
    public GetFollowRequestsQueryValidator()
    {
        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();

        RuleFor(x => x.Query).MustBeValidRelationQuery();
    }
}

internal sealed class GetFollowRequestsQueryHandler(
    AccessibleFollowRequests requests,
    UserProfileProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetFollowRequestsQuery, Result<FollowListPageDto>>,
      IRequestHandler<GetFollowRequestCountQuery, Result<FollowRequestCountDto>>
{
    public async Task<Result<FollowListPageDto>> Handle(GetFollowRequestsQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result<FollowListPageDto>.Unauthorized();
        }

        var requesters = await requests.LoadAsync(viewerId, cancellationToken);

        // Search after the access filter, before counting & paging
        var matched = RelationSearch.Filter(requesters.Select(r => r.User), request.Query);
        var order = requesters.ToDictionary(r => r.User.Id, r => r.Edge);

        var ordered = matched
            .OrderByDescending(u => order[u.Id].UpdatedAt ?? order[u.Id].CreatedAt)
            .ThenBy(u => u.Id.Value)
            .ToList();

        var slice = PagedResponse<UserProfileDto>.Slice(ordered, request.Page, request.PageSize);
        var items = await projector.ProjectAsync(viewerId, slice, cancellationToken: cancellationToken);

        return Result<FollowListPageDto>.Success(new FollowListPageDto(items, request.Page, request.PageSize, ordered.Count, Locked: false));
    }

    public async Task<Result<FollowRequestCountDto>> Handle(GetFollowRequestCountQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result<FollowRequestCountDto>.Unauthorized();
        }

        var requesters = await requests.LoadAsync(viewerId, cancellationToken);

        return Result<FollowRequestCountDto>.Success(new FollowRequestCountDto(requesters.Count));
    }
}
