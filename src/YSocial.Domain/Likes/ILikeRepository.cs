using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes;

/// <summary>
/// Repository interface for Like aggregate root.
/// </summary>
public interface ILikeRepository : IRepository<Like, LikeId>
{
    Task<Like?> GetByUserAndPostAsync(UserId userId, PostId postId, CancellationToken cancellationToken = default);
}
