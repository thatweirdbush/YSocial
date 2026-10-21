using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class PostRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<Post, PostId>(db, unitOfWork), IPostRepository
{
    public async Task<IReadOnlyList<Post>> GetByIdsAsync(IReadOnlyCollection<PostId> ids, CancellationToken cancellationToken = default)
    {
        var wanted = ids.Distinct().ToList();
        return await Set.WhereNotDeleted().Where(p => wanted.Contains(p.Id)).ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<Post>> GetByAuthorIdAsync(UserId authorId, CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted().Where(p => p.AuthorId == authorId).ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Post>> GetByAuthorIdsAsync(IReadOnlyCollection<UserId> authorIds, CancellationToken cancellationToken = default)
    {
        var authors = authorIds.Distinct().ToList();
        return await Set.WhereNotDeleted().Where(p => authors.Contains(p.AuthorId)).ToListAsync(cancellationToken);
    }

    // DEBT: feed candidates are filtered, ordered & paged in memory (BG 10)
    public async Task<IReadOnlyList<Post>> GetAllAsync(CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted().ToListAsync(cancellationToken);

    public async Task<Post?> GetByIdWithHashtagsAsync(PostId id, CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted().Include(p => p.Hashtags).FirstOrDefaultAsync(p => p.Id == id, cancellationToken);

    public async Task<IReadOnlyList<Post>> GetByHashtagKeyAsync(string key, CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted()
            .Where(p => p.Hashtags.Any(h => h.Key == key))
            .Include(p => p.Hashtags)
            .ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<Post>> GetWithHashtagsSinceAsync(DateTime sinceUtc, CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted()
            .Where(p => p.CreatedAt >= sinceUtc && p.Hashtags.Any())
            .Include(p => p.Hashtags)
            .ToListAsync(cancellationToken);
}
