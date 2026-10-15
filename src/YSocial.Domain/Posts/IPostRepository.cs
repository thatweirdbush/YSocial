using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.Posts;

public interface IPostRepository : IRepository<Post, PostId>
{
    Task<IReadOnlyList<Post>> GetByAuthorIdAsync(UserId authorId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Set-based lookup of non-deleted posts (unknown/deleted ids are simply absent).
    /// </summary>
    Task<IReadOnlyList<Post>> GetByIdsAsync(IReadOnlyCollection<PostId> ids, CancellationToken cancellationToken = default);

    /// <summary>
    /// Non-deleted posts of any of the authors (unordered; callers filter, order & page).
    /// </summary>
    Task<IReadOnlyList<Post>> GetByAuthorIdsAsync(IReadOnlyCollection<UserId> authorIds, CancellationToken cancellationToken = default);

    /// <summary>
    /// Every non-deleted post (unordered; feed candidates, callers filter, order & page).
    /// </summary>
    Task<IReadOnlyList<Post>> GetAllAsync(CancellationToken cancellationToken = default);
}
