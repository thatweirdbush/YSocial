using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data;

/// <summary>
/// In-memory implementation of IPostRepository for mocking and rapid development.
/// </summary>
public class MockPostRepository : IPostRepository
{
    private readonly ConcurrentDictionary<PostId, Post> _posts = MockDataStore.Posts;

    public IUnitOfWork UnitOfWork => null!;

    public Task<Post?> GetByIdAsync(PostId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<Post?> GetByIdAsync(PostId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _posts.TryGetValue(id, out var post);

        if (post != null && post.IsDeleted && !includeDeleted)
            return Task.FromResult<Post?>(null);

        return Task.FromResult(post);
    }

    public Task AddAsync(Post post, CancellationToken cancellationToken = default)
    {
        _posts.TryAdd(post.Id, post);
        return Task.CompletedTask;
    }

    public void Update(Post post)
    {
        _posts.AddOrUpdate(post.Id, post, (_, _) => post);
    }

    public void Remove(Post post)
    {
        _posts[post.Id] = post;
    }

    public Task<IReadOnlyList<Post>> GetByIdsAsync(IReadOnlyCollection<PostId> ids, CancellationToken cancellationToken = default)
    {
        var wanted = ids.ToHashSet();
        var posts = _posts.Values
            .WhereNotDeleted()
            .Where(p => wanted.Contains(p.Id))
            .ToList();

        return Task.FromResult<IReadOnlyList<Post>>(posts);
    }

    public Task<IReadOnlyList<Post>> GetByAuthorIdAsync(UserId authorId, CancellationToken cancellationToken = default)
    {
        var posts = _posts.Values
            .WhereNotDeleted()
            .Where(p => p.AuthorId == authorId)
            .ToList();

        return Task.FromResult<IReadOnlyList<Post>>(posts);
    }

    public Task<IReadOnlyList<Post>> GetByAuthorIdsAsync(IReadOnlyCollection<UserId> authorIds, CancellationToken cancellationToken = default)
    {
        var authors = authorIds.ToHashSet();
        var posts = _posts.Values
            .WhereNotDeleted()
            .Where(p => authors.Contains(p.AuthorId))
            .ToList();

        return Task.FromResult<IReadOnlyList<Post>>(posts);
    }

    public Task<IReadOnlyList<Post>> GetAllAsync(CancellationToken cancellationToken = default)
        => Task.FromResult<IReadOnlyList<Post>>(_posts.Values.WhereNotDeleted().ToList());
}
