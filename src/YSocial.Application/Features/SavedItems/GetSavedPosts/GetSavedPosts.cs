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
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.SavedItems.GetSavedPosts;

/// <summary>
/// Saved posts, newest saved first. Posts no longer accessible (deleted, author blocked/deleted/private...) are
/// excluded BEFORE paging and counting (§4.4).
/// </summary>
public sealed record GetSavedPostsQuery(int Page = 1, int PageSize = 10) : ResultQuery<PagedResponse<PostDto>>;

internal sealed class GetSavedPostsQueryValidator : AbstractValidator<GetSavedPostsQuery>
{
    public GetSavedPostsQueryValidator()
    {
        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }
}

internal sealed class GetSavedPostsQueryHandler(
    ISavedItemRepository savedItemRepository,
    IPostRepository postRepository,
    IViewerAccessPolicy accessPolicy,
    PostProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetSavedPostsQuery, Result<PagedResponse<PostDto>>>
{
    public async Task<Result<PagedResponse<PostDto>>> Handle(GetSavedPostsQuery request, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result<PagedResponse<PostDto>>.Unauthorized();
        }

        var userId = new UserId(userContext.UserId);

        var savedItems = await savedItemRepository.GetSavedItemsByUserAsync(userId, SavedItemTargetType.Post, cancellationToken);
        var posts = (await postRepository.GetByIdsAsync(savedItems.Select(s => new PostId(s.TargetId)).Distinct().ToList(), cancellationToken))
            .ToDictionary(p => p.Id);

        var context = await accessPolicy.GetContextAsync(userId, posts.Values.Select(p => p.AuthorId).Distinct().ToList(), cancellationToken);

        // Saved order (newest saved first) preserved; filter BEFORE counting & slicing
        var ordered = savedItems
            .Select(s => posts.GetValueOrDefault(new PostId(s.TargetId)))
            .OfType<Post>()
            .Where(context.IsPostAccessible)
            .ToList();

        var slice = PagedResponse<PostDto>.Slice(ordered, request.Page, request.PageSize);
        var items = await projector.ProjectPostsAsync(userId, slice, cancellationToken);

        return Result<PagedResponse<PostDto>>.Success(new PagedResponse<PostDto>(items, request.Page, request.PageSize, ordered.Count));
    }
}
