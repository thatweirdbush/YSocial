using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes;

/// <summary>
/// Repository interface for Like aggregate root.
/// </summary>
public interface ILikeRepository
{
    Task<Like?> GetByIdAsync(LikeId id, CancellationToken cancellationToken = default);
    Task<Like?> GetByUserAndPostAsync(UserId userId, PostId postId, CancellationToken cancellationToken = default);
    Task AddAsync(Like like, CancellationToken cancellationToken = default);
    void Remove(Like like);
}
