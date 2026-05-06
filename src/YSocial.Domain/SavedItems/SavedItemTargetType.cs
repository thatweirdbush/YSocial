using Microservice.BuildingBlocks.Domain.Enumerations;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;

namespace YSocial.Domain.SavedItems;

public abstract record SavedItemTargetType(int Value, string Name) : Enumeration<SavedItemTargetType>
{
    public static readonly SavedItemTargetType Post = new PostTargetType();
    public static readonly SavedItemTargetType Comment = new CommentTargetType();

    public abstract Task<bool> CheckExistsAsync(Guid targetId, IPostRepository postRepository, ICommentRepository commentRepository, CancellationToken cancellationToken = default);

    private sealed record PostTargetType() : SavedItemTargetType(1, nameof(Post))
    {
        public override async Task<bool> CheckExistsAsync(Guid targetId, IPostRepository postRepository, ICommentRepository commentRepository, CancellationToken cancellationToken = default)
        {
            var post = await postRepository.GetByIdAsync(new PostId(targetId), cancellationToken);
            return post is not null;
        }
    }

    private sealed record CommentTargetType() : SavedItemTargetType(2, nameof(Comment))
    {
        public override async Task<bool> CheckExistsAsync(Guid targetId, IPostRepository postRepository, ICommentRepository commentRepository, CancellationToken cancellationToken = default)
        {
            var comment = await commentRepository.GetByIdAsync(new CommentId(targetId), cancellationToken);
            return comment is not null;
        }
    }
}
