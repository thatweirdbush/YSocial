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
using YSocial.Domain.UserRelations;

namespace YSocial.Application.Features.Feed.GetFeed;

/// <summary>
/// Home feed of root posts, newest first (offset pagination, D16). <c>forYou</c> = every post the viewer may see (anonymous allowed),
/// <c>following</c> = own posts and accepted followees (authenticated). Muted authors (dormant flags included) are excluded;
/// the access policy and the mute filter run BEFORE counting and paging.
/// </summary>
public sealed record GetFeedQuery(string Tab = GetFeedQuery.ForYou, int Page = 1, int PageSize = 10) : ResultQuery<PagedResponse<PostDto>>
{
    public const string ForYou = "forYou";
    public const string Following = "following";

    internal bool IsFollowing => string.Equals(Tab, Following, StringComparison.OrdinalIgnoreCase);
}

internal sealed class GetFeedQueryValidator : AbstractValidator<GetFeedQuery>
{
    public GetFeedQueryValidator()
    {
        RuleFor(x => x.Tab)
            .Must(tab => string.Equals(tab, GetFeedQuery.ForYou, StringComparison.OrdinalIgnoreCase)
                         || string.Equals(tab, GetFeedQuery.Following, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Tab must be 'following' or 'forYou'.");

        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }
}

internal sealed class GetFeedQueryHandler(
    IPostRepository postRepository,
    IUserRelationRepository relationRepository,
    IViewerAccessPolicy accessPolicy,
    PostProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetFeedQuery, Result<PagedResponse<PostDto>>>
{
    public async Task<Result<PagedResponse<PostDto>>> Handle(GetFeedQuery request, CancellationToken cancellationToken)
    {
        var viewerId = userContext.GetViewerId();
        if (request.IsFollowing && viewerId is null)
        {
            return Result<PagedResponse<PostDto>>.Unauthorized();
        }

        // Edges include soft-deleted ones: a mute survives unfollow
        var edges = viewerId is { } viewer
            ? await relationRepository.GetByObserverAsync(viewer, cancellationToken)
            : [];
        var muted = edges.Where(e => e.IsMuted).Select(e => e.TargetId).ToHashSet();

        IReadOnlyList<Post> candidates;
        if (request.IsFollowing)
        {
            var authors = edges
                .Where(e => !e.IsDeleted && e.FollowStatus == FollowStatus.Accepted)
                .Select(e => e.TargetId)
                .Append(viewerId!.Value)
                .Distinct()
                .ToList();
            candidates = await postRepository.GetByAuthorIdsAsync(authors, cancellationToken);
        }
        else
        {
            candidates = await postRepository.GetAllAsync(cancellationToken);
        }

        var context = await accessPolicy.GetContextAsync(viewerId, candidates.Select(p => p.AuthorId).Distinct().ToList(), cancellationToken);

        // Access filter and mute filter, then count & page
        var visible = context.FilterPosts(candidates)
            .Where(p => !muted.Contains(p.AuthorId))
            .OrderByDescending(p => p.CreatedAt)
            .ThenBy(p => p.Id.Value)
            .ToList();

        var slice = PagedResponse<PostDto>.Slice(visible, request.Page, request.PageSize);
        var items = await projector.ProjectPostsAsync(viewerId, slice, cancellationToken);

        return Result<PagedResponse<PostDto>>.Success(new PagedResponse<PostDto>(items, request.Page, request.PageSize, visible.Count));
    }
}
