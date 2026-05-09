using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Comments;

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
