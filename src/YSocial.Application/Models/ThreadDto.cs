namespace YSocial.Application.Models;

/// <summary>
/// Thread view (FE <c>PostThread</c>).
/// </summary>
/// <param name="Post">The requested item (post or comment).</param>
/// <param name="Parent">Comment: its parent comment, or the root post for a top-level comment. Null for posts or when the parent is inaccessible.</param>
/// <param name="Replies">Direct accessible children, newest first.</param>
/// <param name="ChildReplies">Reply id to its accessible children (one level below replies), newest first.</param>
public sealed record ThreadDto(
    PostDto Post,
    PostDto? Parent,
    IReadOnlyList<PostDto> Replies,
    IReadOnlyDictionary<Guid, IReadOnlyList<PostDto>> ChildReplies);
