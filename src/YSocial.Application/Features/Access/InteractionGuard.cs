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

    /// <summary>
    /// Post delete/restore by a non-author: a deleted or inaccessible post "does not exist" for them (404 BEFORE the ownership 403).
    /// </summary>
    public async Task<bool> IsPostHiddenFromAsync(UserId actorId, Post post, CancellationToken cancellationToken = default)
    {
        if (post.AuthorId == actorId) return false;
        if (post.IsDeleted) return true;

        var context = await accessPolicy.GetContextAsync(actorId, [post.AuthorId], cancellationToken);

        return !context.IsPostAccessible(post);
    }

    /// <summary>
    /// Comment delete/restore: participants (comment author, post owner) always reach the ownership rules; anyone else
    /// needs an accessible, live comment, otherwise it "does not exist" (404 BEFORE the ownership 403).
    /// </summary>
    public async Task<bool> IsCommentHiddenFromAsync(UserId actorId, Comment comment, Post root, CancellationToken cancellationToken = default)
    {
        if (actorId == comment.AuthorId || actorId == root.AuthorId) return false;
        if (comment.IsDeleted || root.IsDeleted) return true;

        var context = await accessPolicy.GetContextAsync(actorId, [root.AuthorId, comment.AuthorId], cancellationToken);

        return !context.IsCommentAccessible(comment, root);
    }
}
