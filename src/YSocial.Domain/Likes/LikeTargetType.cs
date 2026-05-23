using Microservice.BuildingBlocks.Domain.Enumerations;
using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes;

public abstract record LikeTargetType(int Value, string Name) : Enumeration<LikeTargetType>
{
    public static readonly LikeTargetType Post = new PostTargetType();
    public static readonly LikeTargetType Comment = new CommentTargetType();

    public abstract Task<UserId?> GetTargetAuthorIdAsync(Guid targetId, IPostRepository postRepository, ICommentRepository commentRepository, CancellationToken cancellationToken = default);

    private sealed record PostTargetType() : LikeTargetType(1, nameof(Post))
    {
        public override async Task<UserId?> GetTargetAuthorIdAsync(Guid targetId, IPostRepository postRepository, ICommentRepository commentRepository, CancellationToken cancellationToken = default)
        {
            var post = await postRepository.GetByIdAsync(new PostId(targetId), cancellationToken);
            return post?.AuthorId;
        }
    }

    private sealed record CommentTargetType() : LikeTargetType(2, nameof(Comment))
    {
        public override async Task<UserId?> GetTargetAuthorIdAsync(Guid targetId, IPostRepository postRepository, ICommentRepository commentRepository, CancellationToken cancellationToken = default)
        {
            var comment = await commentRepository.GetByIdAsync(new CommentId(targetId), cancellationToken);
            return comment?.AuthorId;
        }
    }
}
