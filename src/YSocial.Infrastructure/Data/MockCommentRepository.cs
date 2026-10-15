using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;

namespace YSocial.Infrastructure.Data;

public class MockCommentRepository : ICommentRepository
{
    private readonly ConcurrentDictionary<CommentId, Comment> _comments = MockDataStore.Comments;

    public IUnitOfWork UnitOfWork => null!;

    public Task<Comment?> GetByIdAsync(CommentId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<Comment?> GetByIdAsync(CommentId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _comments.TryGetValue(id, out var comment);
        if (comment != null && comment.IsDeleted && !includeDeleted) return Task.FromResult<Comment?>(null);
        return Task.FromResult(comment);
    }

    public Task<IReadOnlyList<CommentChildRow>> GetTopLevelCommentsByPostIdsAsync(IReadOnlyCollection<PostId> postIds, CancellationToken cancellationToken = default)
    {
        var wanted = postIds.ToHashSet();
        var rows = _comments.Values
            .Where(c => !c.IsDeleted && c.ParentCommentId is null && wanted.Contains(c.PostId))
            .Select(c => new CommentChildRow(c.PostId.Value, c.Id, c.AuthorId))
            .ToList();

        return Task.FromResult<IReadOnlyList<CommentChildRow>>(rows);
    }

    public Task<IReadOnlyList<CommentChildRow>> GetChildCommentsByParentIdsAsync(IReadOnlyCollection<CommentId> parentIds, CancellationToken cancellationToken = default)
    {
        var wanted = parentIds.ToHashSet();
        var rows = _comments.Values
            .Where(c => !c.IsDeleted && c.ParentCommentId is { } parent && wanted.Contains(parent))
            .Select(c => new CommentChildRow(c.ParentCommentId!.Value.Value, c.Id, c.AuthorId))
            .ToList();

        return Task.FromResult<IReadOnlyList<CommentChildRow>>(rows);
    }

    public Task<IReadOnlyList<Comment>> GetTopLevelByPostIdAsync(PostId postId, CancellationToken cancellationToken = default)
    {
        var comments = _comments.Values
            .Where(c => !c.IsDeleted && c.ParentCommentId is null && c.PostId == postId)
            .ToList();

        return Task.FromResult<IReadOnlyList<Comment>>(comments);
    }

    public Task<IReadOnlyList<Comment>> GetChildrenAsync(IReadOnlyCollection<CommentId> parentIds, CancellationToken cancellationToken = default)
    {
        var wanted = parentIds.ToHashSet();
        var comments = _comments.Values
            .Where(c => !c.IsDeleted && c.ParentCommentId is { } parent && wanted.Contains(parent))
            .ToList();

        return Task.FromResult<IReadOnlyList<Comment>>(comments);
    }

    public Task AddAsync(Comment comment, CancellationToken cancellationToken = default)
    {
        _comments.TryAdd(comment.Id, comment);
        return Task.CompletedTask;
    }

    public void Update(Comment comment)
    {
        _comments.AddOrUpdate(comment.Id, comment, (_, _) => comment);
    }

    public void Remove(Comment comment)
    {
        _comments[comment.Id] = comment;
    }
}
