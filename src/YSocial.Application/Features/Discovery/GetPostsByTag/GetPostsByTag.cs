using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Features.Access;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Application.Models.Commons;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Discovery.GetPostsByTag;

/// <summary>
/// Root posts carrying a tag (folded match, with or without leading <c>#</c>), policy-filtered BEFORE count & page (D31).
/// Unknown tag = empty page (tags are not entities), never 404.
/// </summary>
public sealed record GetPostsByTagQuery(string Tag, string Sort = GetPostsByTagQuery.Latest, int Page = 1, int PageSize = 10)
    : ResultQuery<TagPostsPageDto>
{
    public const string Latest = "latest";
    public const string Top = "top";

    /// <summary>
    /// Tag without surrounding whitespace and one leading <c>#</c>.
    /// </summary>
    internal string Bare => Normalize(Tag);

    internal bool IsTop => string.Equals(Sort, Top, StringComparison.OrdinalIgnoreCase);

    internal static string Normalize(string? tag)
    {
        var trimmed = (tag ?? string.Empty).Trim();
        return trimmed.StartsWith('#') ? trimmed[1..] : trimmed;
    }
}

internal sealed class GetPostsByTagQueryValidator : AbstractValidator<GetPostsByTagQuery>
{
    public GetPostsByTagQueryValidator()
    {
        // Valid = exactly what the parser would read as 1 whole tag
        RuleFor(x => x.Bare)
            .Must(BeWholeTag)
            .WithName("Tag")
            .WithMessage($"'Tag' must be 1 to {HashtagParser.MaxTagLength} letters, digits or underscores.");

        RuleFor(x => x.Sort)
            .Must(sort => string.Equals(sort, GetPostsByTagQuery.Latest, StringComparison.OrdinalIgnoreCase)
                          || string.Equals(sort, GetPostsByTagQuery.Top, StringComparison.OrdinalIgnoreCase))
            .WithMessage("Sort must be 'top' or 'latest'.");

        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }

    private static bool BeWholeTag(string bare)
    {
        var tags = HashtagParser.Extract("#" + bare);
        return tags.Count == 1 && tags[0].Display == bare;
    }
}

internal sealed class GetPostsByTagQueryHandler(
    IPostRepository postRepository,
    IViewerAccessPolicy accessPolicy,
    PostProjector projector,
    IUserContext userContext)
    : IRequestHandler<GetPostsByTagQuery, Result<TagPostsPageDto>>
{
    public async Task<Result<TagPostsPageDto>> Handle(GetPostsByTagQuery request, CancellationToken cancellationToken)
    {
        var viewerId = userContext.GetViewerId();
        var key = HashtagParser.Fold(request.Bare);

        var candidates = await postRepository.GetByHashtagKeyAsync(key, cancellationToken);
        var context = await accessPolicy.GetContextAsync(viewerId, candidates.Select(p => p.AuthorId).Distinct().ToList(), cancellationToken);
        var visible = context.FilterPosts(candidates);

        var ordered = (request.IsTop
                ? visible.OrderByDescending(p => p.LikeCount).ThenByDescending(p => p.CreatedAt)
                : visible.OrderByDescending(p => p.CreatedAt))
            .ThenBy(p => p.Id.Value)
            .ToList();

        var slice = PagedResponse<Post>.Slice(ordered, request.Page, request.PageSize);
        var items = await projector.ProjectPostsAsync(viewerId, slice, cancellationToken);
        var display = TagAggregation.DisplayOf(visible, key) ?? request.Bare;

        return Result<TagPostsPageDto>.Success(new TagPostsPageDto(items, request.Page, request.PageSize, ordered.Count, display));
    }
}
