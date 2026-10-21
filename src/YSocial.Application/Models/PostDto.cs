using System.Text.Json.Serialization;

namespace YSocial.Application.Models;

/// <summary>
/// Unified post/comment projection (FE <c>PostItem</c>).
/// </summary>
/// <param name="Kind"><c>post</c> | <c>comment</c>.</param>
/// <param name="PostId">Root post id (== <paramref name="Id"/> for posts).</param>
/// <param name="ParentId">Comments only: parent comment id, or the post id for a top-level comment. Absent for posts.</param>
/// <param name="ImageUrl">Posts only; absent when none.</param>
/// <param name="IsEdited">UpdatedAt is set.</param>
/// <param name="LikesCount">Stored aggregate, NOT viewer-filtered (accepted exception: number only, no identities).</param>
/// <param name="CommentsCount">DIRECT children only, same access filter as the thread replies.</param>
/// <param name="Visibility"><c>public</c> | <c>followersOnly</c> | <c>private</c> (comments inherit the root post).</param>
/// <param name="Media">Attached media in display order; always present (empty for comments and text posts).</param>
public sealed record PostDto(
    Guid Id,
    string Kind,
    Guid PostId,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] Guid? ParentId,
    string Content,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? ImageUrl,
    DateTime CreatedAt,
    bool IsEdited,
    int LikesCount,
    int CommentsCount,
    bool IsLikedByCurrentUser,
    bool IsBookmarkedByCurrentUser,
    PostAuthorDto User,
    string Visibility,
    IReadOnlyList<MediaDto> Media);

public sealed record PostAuthorDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, bool IsVerified);
