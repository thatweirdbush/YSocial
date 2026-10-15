using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Access;

/// <summary>
/// Write-side gate (D14): like, bookmark & co. require the target (and its root post) to be accessible to the actor,
/// otherwise the target "does not exist" (404). Rules come from <see cref="IViewerAccessPolicy"/> only.
/// </summary>
internal sealed class InteractionGuard(
    IPostRepository postRepository,
    ICommentRepository commentRepository,
    IViewerAccessPolicy accessPolicy)
{
    public async Task<bool> CanInteractAsync(UserId actorId, Guid targetId, bool isComment, CancellationToken cancellationToken = default)
        => isComment
            ? await CanInteractWithCommentAsync(actorId, new CommentId(targetId), cancellationToken)
            : await CanInteractWithPostAsync(actorId, new PostId(targetId), cancellationToken);

    private async Task<bool> CanInteractWithPostAsync(UserId actorId, PostId postId, CancellationToken cancellationToken)
    {
        var post = await postRepository.GetByIdAsync(postId, cancellationToken);
        if (post is null) return false;

        var context = await accessPolicy.GetContextAsync(actorId, [post.AuthorId], cancellationToken);

        return context.IsPostAccessible(post);
    }

    private async Task<bool> CanInteractWithCommentAsync(UserId actorId, CommentId commentId, CancellationToken cancellationToken)
    {
        var comment = await commentRepository.GetByIdAsync(commentId, cancellationToken);
        if (comment is null) return false;

        var root = await postRepository.GetByIdAsync(comment.PostId, cancellationToken);
        if (root is null) return false;

        var context = await accessPolicy.GetContextAsync(actorId, [root.AuthorId, comment.AuthorId], cancellationToken);

        return context.IsCommentAccessible(comment, root);
    }
}
