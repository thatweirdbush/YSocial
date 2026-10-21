using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Access;
using YSocial.Application.Models;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Discovery.GetTrendingTags;

/// <summary>
/// Most used tags among posts the viewer may see, over the first of 7 / 30 / 365 days that yields at least
/// <see cref="Limit"/> tags (the 365-day result is used as is when none does). Anonymous allowed (D31).
/// </summary>
public sealed record GetTrendingTagsQuery(int Limit = GetTrendingTagsQuery.DefaultLimit) : ResultQuery<IReadOnlyList<TrendingTagDto>>
{
    public const int DefaultLimit = 5;
    public const int MaxLimit = 50;
}

internal sealed class GetTrendingTagsQueryValidator : AbstractValidator<GetTrendingTagsQuery>
{
    public GetTrendingTagsQueryValidator()
    {
        RuleFor(x => x.Limit).InclusiveBetween(1, GetTrendingTagsQuery.MaxLimit);
    }
}

internal sealed class GetTrendingTagsQueryHandler(
    IPostRepository postRepository,
    IViewerAccessPolicy accessPolicy,
    IUserContext userContext,
    TimeProvider clock)
    : IRequestHandler<GetTrendingTagsQuery, Result<IReadOnlyList<TrendingTagDto>>>
{
    private static readonly int[] WindowDays = [7, 30, 365];

    public async Task<Result<IReadOnlyList<TrendingTagDto>>> Handle(GetTrendingTagsQuery request, CancellationToken cancellationToken)
    {
        var now = clock.GetUtcNow().UtcDateTime;
        var candidates = await postRepository.GetWithHashtagsSinceAsync(now.AddDays(-WindowDays[^1]), cancellationToken);

        var context = await accessPolicy.GetContextAsync(
            userContext.GetViewerId(), candidates.Select(p => p.AuthorId).Distinct().ToList(), cancellationToken);
        var visible = context.FilterPosts(candidates);

        // Windows are nested, so 1 query serves all of them
        IReadOnlyList<TagAggregation.TagStat> stats = [];
        foreach (var days in WindowDays)
        {
            var since = now.AddDays(-days);
            stats = TagAggregation.Aggregate(visible.Where(p => p.CreatedAt >= since));
            if (stats.Count >= request.Limit) break;
        }

        IReadOnlyList<TrendingTagDto> items = stats.Take(request.Limit).Select(s => new TrendingTagDto(s.Display, s.PostsCount)).ToList();

        return Result<IReadOnlyList<TrendingTagDto>>.Success(items);
    }
}
