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
    {
        _posts.TryGetValue(id, out var post);
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
        _posts.TryRemove(post.Id, out _);
    }

    public Task<IEnumerable<Post>> GetByAuthorIdAsync(UserId authorId)
    {
        var posts = _posts.Values.Where(p => p.AuthorId == authorId);
        return Task.FromResult(posts);
    }
}
