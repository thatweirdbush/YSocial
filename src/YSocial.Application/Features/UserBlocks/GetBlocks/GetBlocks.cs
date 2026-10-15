using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Features.Users.Projection;
using YSocial.Application.Models;
using YSocial.Application.Models.Commons;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.UserBlocks.GetBlocks;

/// <summary>
/// Own block list, newest block first (D14 exception: <c>isBlocked: true</c>); deleted users are omitted.
/// </summary>
public sealed record GetBlocksQuery(int Page = 1, int PageSize = 20) : ResultQuery<PagedResponse<UserProfileDto>>;

internal sealed class GetBlocksQueryValidator : AbstractValidator<GetBlocksQuery>
{
    public GetBlocksQueryValidator()
    {
        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }
}

internal sealed class GetBlocksQueryHandler(
    IUserRepository userRepository,
    IUserBlockRepository blockRepository,
    UserProfileProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetBlocksQuery, Result<PagedResponse<UserProfileDto>>>
{
    public async Task<Result<PagedResponse<UserProfileDto>>> Handle(GetBlocksQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result<PagedResponse<UserProfileDto>>.Unauthorized();
        }

        var blocks = await blockRepository.GetByObserverAsync(viewerId, cancellationToken);
        var users = (await userRepository.GetUsersByIdsAsync(blocks.Select(b => b.TargetId).ToList(), cancellationToken))
            .ToDictionary(u => u.Id);

        var ordered = blocks
            .Where(b => users.ContainsKey(b.TargetId))
            .OrderByDescending(b => b.CreatedAt)
            .ThenBy(b => b.TargetId.Value)
            .Select(b => users[b.TargetId])
            .ToList();

        var slice = PagedResponse<UserProfileDto>.Slice(ordered, request.Page, request.PageSize);
        var items = await projector.ProjectAsync(viewerId, slice, markAsBlocked: true, cancellationToken: cancellationToken);

        return Result<PagedResponse<UserProfileDto>>.Success(new PagedResponse<UserProfileDto>(items, request.Page, request.PageSize, ordered.Count));
    }
}
