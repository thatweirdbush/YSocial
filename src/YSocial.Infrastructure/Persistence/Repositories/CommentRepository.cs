using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class CommentRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<Comment, CommentId>(db, unitOfWork), ICommentRepository
{
    public async Task<IReadOnlyList<CommentChildRow>> GetTopLevelCommentsByPostIdsAsync(IReadOnlyCollection<PostId> postIds, CancellationToken cancellationToken = default)
    {
        var wanted = postIds.Distinct().ToList();
        var rows = await Set.AsNoTracking()
            .Where(c => !c.IsDeleted && c.ParentCommentId == null && wanted.Contains(c.PostId))
            .Select(c => new { c.PostId, c.Id, c.AuthorId })
            .ToListAsync(cancellationToken);

        return rows.Select(c => new CommentChildRow(c.PostId.Value, c.Id, c.AuthorId)).ToList();
    }

    public async Task<IReadOnlyList<CommentChildRow>> GetChildCommentsByParentIdsAsync(IReadOnlyCollection<CommentId> parentIds, CancellationToken cancellationToken = default)
    {
        var wanted = parentIds.Distinct().Select(id => (CommentId?)id).ToList();
        var rows = await Set.AsNoTracking()
            .Where(c => !c.IsDeleted && wanted.Contains(c.ParentCommentId))
            .Select(c => new { c.ParentCommentId, c.Id, c.AuthorId })
            .ToListAsync(cancellationToken);

        return rows.Select(c => new CommentChildRow(c.ParentCommentId!.Value.Value, c.Id, c.AuthorId)).ToList();
    }

    public async Task<IReadOnlyList<Comment>> GetTopLevelByPostIdAsync(PostId postId, CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted().Where(c => c.ParentCommentId == null && c.PostId == postId).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Comment>> GetChildrenAsync(IReadOnlyCollection<CommentId> parentIds, CancellationToken cancellationToken = default)
    {
        var wanted = parentIds.Distinct().Select(id => (CommentId?)id).ToList();
        return await Set.WhereNotDeleted().Where(c => wanted.Contains(c.ParentCommentId)).ToListAsync(cancellationToken);
    }
}
