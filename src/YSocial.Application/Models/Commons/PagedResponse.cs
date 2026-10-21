namespace YSocial.Application.Models.Commons;

/// <summary>
/// Offset page envelope (D16). <see cref="TotalCount"/> counts only what the viewer may see.
/// </summary>
public record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public bool HasNextPage => (long)Page * PageSize < TotalCount;

    /// <summary>
    /// Newest-first slice of an ALREADY access-filtered list; a page beyond the last is empty with real metadata.
    /// </summary>
    public static IReadOnlyList<TItem> Slice<TItem>(IReadOnlyList<TItem> filtered, int page, int pageSize)
        => filtered.Skip((int)Math.Min((long)(page - 1) * pageSize, int.MaxValue)).Take(pageSize).ToList();
}

/// <summary>
/// <c>GET /api/posts/user/{userId}</c>: <see cref="Locked"/> = private profile the viewer may not open
/// (empty items, <c>totalCount</c> 0), never mixed with 404 semantics.
/// </summary>
public sealed record UserPostsPageDto(IReadOnlyList<PostDto> Items, int Page, int PageSize, int TotalCount, bool Locked)
    : PagedResponse<PostDto>(Items, Page, PageSize, TotalCount);

/// <summary>
/// <c>GET /api/tags/{tag}/posts</c>: <see cref="Tag"/> = most used casing of the tag over ALL matching visible posts
/// (echo of the input without <c>#</c> when none).
/// </summary>
public sealed record TagPostsPageDto(IReadOnlyList<PostDto> Items, int Page, int PageSize, int TotalCount, string Tag)
    : PagedResponse<PostDto>(Items, Page, PageSize, TotalCount);
