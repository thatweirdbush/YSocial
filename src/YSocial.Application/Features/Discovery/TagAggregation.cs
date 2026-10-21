using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Discovery;

/// <summary>
/// Per-tag counts over ALREADY access-filtered posts (callers filter first, then count).
/// </summary>
internal static class TagAggregation
{
    internal sealed record TagStat(string Key, string Display, int PostsCount);

    /// <summary>
    /// 1 stat per tag key, ordered by count desc then key ordinal asc. Display = most used casing,
    /// ties go to the casing of the newest post, then ordinal ascending.
    /// </summary>
    public static IReadOnlyList<TagStat> Aggregate(IEnumerable<Post> posts)
    {
        var uses = posts
            .SelectMany(post => post.Hashtags.Select(tag => (tag.Key, tag.Display, post.CreatedAt)))
            .GroupBy(use => use.Key, StringComparer.Ordinal);

        return uses
            .Select(group => new TagStat(group.Key, PickDisplay(group.Select(u => (u.Display, u.CreatedAt))), group.Count()))
            .OrderByDescending(stat => stat.PostsCount)
            .ThenBy(stat => stat.Key, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Display casing of 1 tag over the posts that carry it (empty -> null).
    /// </summary>
    public static string? DisplayOf(IEnumerable<Post> posts, string key)
    {
        var uses = posts
            .SelectMany(post => post.Hashtags.Where(tag => tag.Key == key).Select(tag => (tag.Display, post.CreatedAt)))
            .ToList();

        return uses.Count == 0 ? null : PickDisplay(uses);
    }

    private static string PickDisplay(IEnumerable<(string Display, DateTime CreatedAt)> uses)
        => uses
            .GroupBy(use => use.Display, StringComparer.Ordinal)
            .OrderByDescending(group => group.Count())
            .ThenByDescending(group => group.Max(use => use.CreatedAt))
            .ThenBy(group => group.Key, StringComparer.Ordinal)
            .First().Key;
}
