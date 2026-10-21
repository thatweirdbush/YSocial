namespace YSocial.Application.Models;

/// <summary>
/// Trending tag: <paramref name="Tag"/> = most used casing without <c>#</c>, <paramref name="PostsCount"/> = visible posts in the chosen window.
/// </summary>
public sealed record TrendingTagDto(string Tag, int PostsCount);
