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

namespace YSocial.Application.Features.UserRelations.GetMutes;

/// <summary>
/// Own muted users (dormant flags included), newest mute first; blocked/deleted users are excluded before paging.
/// </summary>
public sealed record GetMutesQuery(int Page = 1, int PageSize = 20, string? Query = null) : ResultQuery<PagedResponse<UserProfileDto>>;

internal sealed class GetMutesQueryValidator : AbstractValidator<GetMutesQuery>
{
    public GetMutesQueryValidator()
    {
        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();

        RuleFor(x => x.Query).MustBeValidRelationQuery();
    }
}

internal sealed class GetMutesQueryHandler(
    IUserRepository userRepository,
    IUserRelationRepository relationRepository,
    IViewerAccessPolicy accessPolicy,
    UserProfileProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetMutesQuery, Result<PagedResponse<UserProfileDto>>>
{
    public async Task<Result<PagedResponse<UserProfileDto>>> Handle(GetMutesQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result<PagedResponse<UserProfileDto>>.Unauthorized();
        }

        var muted = (await relationRepository.GetByObserverAsync(viewerId, cancellationToken))
            .Where(e => e.IsMuted)
            .ToDictionary(e => e.TargetId);

        var users = await userRepository.GetUsersByIdsAsync(muted.Keys.ToList(), cancellationToken);
        var context = await accessPolicy.GetContextAsync(viewerId, muted.Keys.ToList(), cancellationToken);

        // Access filter, then search, then count & page
        var ordered = RelationSearch.Filter(context.FilterUsers(users), request.Query)
            .OrderByDescending(u => muted[u.Id].MutedAt ?? muted[u.Id].CreatedAt)
            .ThenBy(u => u.Id.Value)
            .ToList();

        var slice = PagedResponse<UserProfileDto>.Slice(ordered, request.Page, request.PageSize);
        var items = await projector.ProjectAsync(viewerId, slice, cancellationToken: cancellationToken);

        return Result<PagedResponse<UserProfileDto>>.Success(new PagedResponse<UserProfileDto>(items, request.Page, request.PageSize, ordered.Count));
    }
}
