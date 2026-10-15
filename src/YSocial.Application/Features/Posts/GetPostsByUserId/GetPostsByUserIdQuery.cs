using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Features.Access;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models;
using YSocial.Application.Models.Commons;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.GetPostsByUserId;

/// <summary>
/// Root posts of a profile, newest first. Blocked either way / deleted / unknown = 404 (D14, D20);
/// private profile the viewer may not open = 200 locked (D15).
/// </summary>
public sealed record GetPostsByUserIdQuery(Guid UserId, int Page, int PageSize) : ResultQuery<UserPostsPageDto>;

internal sealed class GetPostsByUserIdQueryValidator : AbstractValidator<GetPostsByUserIdQuery>
{
    public GetPostsByUserIdQueryValidator()
    {
        RuleFor(x => x.UserId)
            .NotEmpty();

        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }
}

internal sealed class GetPostsByUserIdQueryHandler(
    IUserRepository userRepository,
    IPostRepository postRepository,
    IViewerAccessPolicy accessPolicy,
    PostProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetPostsByUserIdQuery, Result<UserPostsPageDto>>
{
    public async Task<Result<UserPostsPageDto>> Handle(GetPostsByUserIdQuery request, CancellationToken cancellationToken)
    {
        var viewerId = userContext.GetViewerId();
        var targetId = new UserId(request.UserId);

        var target = await userRepository.GetByIdAsync(targetId, cancellationToken);
        var context = await accessPolicy.GetContextAsync(viewerId, [targetId], cancellationToken);

        if (target is null || !context.IsDiscoverable(targetId))
        {
            return Result<UserPostsPageDto>.NotFound("User not found.");
        }

        if (!context.CanViewContent(targetId))
        {
            return Result<UserPostsPageDto>.Success(new UserPostsPageDto([], request.Page, request.PageSize, 0, Locked: true));
        }

        // Filter BEFORE counting & slicing
        var visible = context.FilterPosts(await postRepository.GetByAuthorIdAsync(targetId, cancellationToken))
            .OrderByDescending(p => p.CreatedAt)
            .ToList();

        var slice = PagedResponse<PostDto>.Slice(visible, request.Page, request.PageSize);
        var items = await projector.ProjectPostsAsync(viewerId, slice, cancellationToken);

        return Result<UserPostsPageDto>.Success(new UserPostsPageDto(items, request.Page, request.PageSize, visible.Count, Locked: false));
    }
}
