using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments;

public interface ICommentRepository : IRepository<Comment, CommentId>
{
    /// <summary>
    /// Direct (top-level) comments of the posts: <c>PostId</c> in set, no parent, not deleted.
    /// Rows are keyed by the post id. Typed on purpose: post ids and comment ids are never mixed.
    /// </summary>
    Task<IReadOnlyList<CommentChildRow>> GetTopLevelCommentsByPostIdsAsync(IReadOnlyCollection<PostId> postIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// Direct replies of the comments: <c>ParentCommentId</c> in set, not deleted. Rows are keyed by the parent comment id.
    /// </summary>
    Task<IReadOnlyList<CommentChildRow>> GetChildCommentsByParentIdsAsync(IReadOnlyCollection<CommentId> parentIds, CancellationToken cancellationToken = default);
}

/// <summary>
/// Light child row for counting (author is needed to apply the access filter).
/// </summary>
/// <param name="ParentKey">Post id (top-level query) or parent comment id (child query), as a raw guid.</param>
public sealed record CommentChildRow(Guid ParentKey, CommentId CommentId, UserId AuthorId);
