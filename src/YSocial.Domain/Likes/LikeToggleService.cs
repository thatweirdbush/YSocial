using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes;

/// <summary>
/// Domain service that encapsulates the stateless business rules for toggling likes.
/// It does not retrieve data, only makes domain decisions.
/// </summary>
public sealed class LikeToggleService
{
    /// <summary>
    /// Evaluates whether to Like or Unlike based on the presence of an existing like.
    /// Does not interact with repositories directly.
    /// </summary>
    public LikeToggleResult ToggleLike(Like? existingLike, PostId postId, UserId userId)
    {
        if (existingLike is not null)
        {
            return new LikeToggleResult(LikeStatus.Unliked, existingLike);
        }

        var newLike = Like.Create(postId, userId);
        return new LikeToggleResult(LikeStatus.Liked, newLike);
    }
}
