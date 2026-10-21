using YSocial.Application.Features.Access;
using YSocial.Application.Features.Media;
using YSocial.Application.Models;
using YSocial.Domain.Comments;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Posts.Projection;

/// <summary>
/// Batch projector of <see cref="PostDto"/> for posts AND comments: fixed number of repo calls regardless of page size.
/// Items the viewer may not see (access policy, §4.4) are dropped, never stubbed.
/// </summary>
internal sealed class PostProjector(
    IViewerAccessPolicy accessPolicy,
    ILikeRepository likeRepository,
    ISavedItemRepository savedItemRepository,
    ICommentRepository commentRepository,
    IPostRepository postRepository)
{
    /// <summary>
    /// Projects the accessible items, keyed by item id (post ids and comment ids are distinct guids).
    /// </summary>
    public async Task<IReadOnlyDictionary<Guid, PostDto>> ProjectAsync(
        UserId? viewerId,
        IReadOnlyCollection<Post> posts,
        IReadOnlyCollection<Comment> comments,
        CancellationToken cancellationToken = default)
    {
        var result = new Dictionary<Guid, PostDto>();
        if (posts.Count == 0 && comments.Count == 0)
        {
            return result;
        }

        // Root posts of the comments (visibility is inherited from them)
        var rootPosts = posts.ToDictionary(p => p.Id);
        var missingRoots = comments.Select(c => c.PostId).Distinct().Where(id => !rootPosts.ContainsKey(id)).ToList();
        if (missingRoots.Count > 0)
        {
            foreach (var root in await postRepository.GetByIdsAsync(missingRoots, cancellationToken))
            {
                rootPosts[root.Id] = root;
            }
        }

        // Direct children (typed queries: post ids and comment ids never mix)
        var topLevelRows = posts.Count > 0
            ? await commentRepository.GetTopLevelCommentsByPostIdsAsync(posts.Select(p => p.Id).ToList(), cancellationToken)
            : [];
        var replyRows = comments.Count > 0
            ? await commentRepository.GetChildCommentsByParentIdsAsync(comments.Select(c => c.Id).ToList(), cancellationToken)
            : [];

        var authorIds = posts.Select(p => p.AuthorId)
            .Concat(comments.Select(c => c.AuthorId))
            .Concat(rootPosts.Values.Select(p => p.AuthorId))
            .Concat(topLevelRows.Select(r => r.AuthorId))
            .Concat(replyRows.Select(r => r.AuthorId))
            .Distinct()
            .ToList();
        var context = await accessPolicy.GetContextAsync(viewerId, authorIds, cancellationToken);

        var visiblePosts = posts.Where(context.IsPostAccessible).ToList();
        var visibleComments = comments
            .Where(c => context.IsCommentAccessible(c, rootPosts.GetValueOrDefault(c.PostId)))
            .ToList();

        var flags = await LoadViewerFlagsAsync(viewerId, visiblePosts, visibleComments, cancellationToken);

        foreach (var post in visiblePosts)
        {
            var commentsCount = topLevelRows.Count(r => r.ParentKey == post.Id.Value && context.IsDiscoverable(r.AuthorId));

            result[post.Id.Value] = new PostDto(
                post.Id.Value, "post", post.Id.Value, null,
                post.Content, post.ImageUrl, post.CreatedAt, post.UpdatedAt is not null,
                post.LikeCount, commentsCount,
                flags.LikedPosts.Contains(post.Id.Value), flags.SavedPosts.Contains(post.Id.Value),
                ToAuthor(context, post.AuthorId), ToCamel(post.Visibility.Name),
                post.Media.Select(MediaMapping.ToDto).ToList());
        }

        foreach (var comment in visibleComments)
        {
            var root = rootPosts[comment.PostId];
            var commentsCount = replyRows.Count(r => r.ParentKey == comment.Id.Value && context.IsDiscoverable(r.AuthorId));

            result[comment.Id.Value] = new PostDto(
                comment.Id.Value, "comment", comment.PostId.Value, comment.ParentCommentId?.Value ?? comment.PostId.Value,
                comment.Content, null, comment.CreatedAt, comment.UpdatedAt is not null,
                comment.LikeCount, commentsCount,
                flags.LikedComments.Contains(comment.Id.Value), flags.SavedComments.Contains(comment.Id.Value),
                ToAuthor(context, comment.AuthorId), ToCamel(root.Visibility.Name), []);
        }

        return result;
    }

    /// <summary>
    /// Projects posts only, keeping input order (inaccessible ones are dropped).
    /// </summary>
    public async Task<IReadOnlyList<PostDto>> ProjectPostsAsync(UserId? viewerId, IReadOnlyCollection<Post> posts, CancellationToken cancellationToken = default)
    {
        var items = await ProjectAsync(viewerId, posts, [], cancellationToken);

        return posts.Where(p => items.ContainsKey(p.Id.Value)).Select(p => items[p.Id.Value]).ToList();
    }

    private async Task<ViewerFlags> LoadViewerFlagsAsync(UserId? viewerId, IReadOnlyCollection<Post> posts, IReadOnlyCollection<Comment> comments, CancellationToken cancellationToken)
    {
        if (viewerId is not { } viewer)
        {
            return ViewerFlags.None;
        }

        var postIds = posts.Select(p => p.Id.Value).ToList();
        var commentIds = comments.Select(c => c.Id.Value).ToList();

        return new ViewerFlags(
            postIds.Count > 0 ? await likeRepository.GetLikedTargetIdsAsync(viewer, postIds, LikeTargetType.Post, cancellationToken) : Empty,
            commentIds.Count > 0 ? await likeRepository.GetLikedTargetIdsAsync(viewer, commentIds, LikeTargetType.Comment, cancellationToken) : Empty,
            postIds.Count > 0 ? await savedItemRepository.GetSavedTargetIdsAsync(viewer, postIds, SavedItemTargetType.Post, cancellationToken) : Empty,
            commentIds.Count > 0 ? await savedItemRepository.GetSavedTargetIdsAsync(viewer, commentIds, SavedItemTargetType.Comment, cancellationToken) : Empty);
    }

    private static readonly IReadOnlySet<Guid> Empty = new HashSet<Guid>();

    private static PostAuthorDto ToAuthor(ViewerAccessContext context, UserId authorId)
    {
        var author = context.GetUser(authorId)!;

        return new PostAuthorDto(author.Id.Value, author.Username, author.ProfileInfo.DisplayName, author.ProfileInfo.AvatarUrl, IsVerified: false);
    }

    private static string ToCamel(string name) => char.ToLowerInvariant(name[0]) + name[1..];

    private sealed record ViewerFlags(
        IReadOnlySet<Guid> LikedPosts,
        IReadOnlySet<Guid> LikedComments,
        IReadOnlySet<Guid> SavedPosts,
        IReadOnlySet<Guid> SavedComments)
    {
        public static ViewerFlags None { get; } = new(Empty, Empty, Empty, Empty);
    }
}
