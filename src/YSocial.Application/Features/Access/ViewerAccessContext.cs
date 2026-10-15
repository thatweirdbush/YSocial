using YSocial.Domain.Comments;
using YSocial.Domain.Posts;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Access;

/// <summary>
/// Immutable access facts for one viewer and a candidate set. Anything absent from the user set
/// (deleted or unknown) is inaccessible; an anonymous viewer has no blocks or relations.
/// </summary>
public sealed class ViewerAccessContext
{
    private readonly IReadOnlyDictionary<UserId, User> _users;
    private readonly IReadOnlySet<UserId> _blockedEitherWay;
    private readonly IReadOnlyDictionary<UserId, RelationSnapshot> _relations;

    internal ViewerAccessContext(
        UserId? viewerId,
        IReadOnlyDictionary<UserId, User> users,
        IReadOnlySet<UserId> blockedEitherWay,
        IReadOnlyDictionary<UserId, RelationSnapshot> relations)
    {
        ViewerId = viewerId;
        _users = users;
        _blockedEitherWay = blockedEitherWay;
        _relations = relations;
    }

    public UserId? ViewerId { get; }

    public bool IsViewer(UserId userId) => ViewerId == userId;

    public User? GetUser(UserId userId) => _users.GetValueOrDefault(userId);

    /// <summary>
    /// Edge from the viewer to the candidate (null = no edge). Flags are informational only.
    /// </summary>
    public RelationSnapshot? RelationTo(UserId userId) => _relations.GetValueOrDefault(userId);

    public bool IsBlockedEitherWay(UserId userId) => _blockedEitherWay.Contains(userId);

    #region Predicates

    /// <summary>
    /// Exists, not deleted, not blocked either way.
    /// </summary>
    public bool IsDiscoverable(UserId userId) => _users.ContainsKey(userId) && !_blockedEitherWay.Contains(userId);

    /// <summary>
    /// Owner, public profile, or accepted follower. Says nothing about discoverability.
    /// </summary>
    public bool CanViewContent(UserId ownerId)
    {
        if (IsViewer(ownerId)) return true;
        if (!_users.TryGetValue(ownerId, out var owner)) return false;

        return !owner.PrivacySettings.IsPrivateProfile || IsAcceptedFollower(ownerId);
    }

    /// <summary>
    /// Author discoverable, content visible and <see cref="Post.Visibility"/> allows the viewer.
    /// </summary>
    public bool CanViewPost(Post post)
    {
        var author = post.AuthorId;
        if (!IsDiscoverable(author) || !CanViewContent(author)) return false;
        if (IsViewer(author)) return true;

        if (post.Visibility == PostVisibility.Private) return false;
        if (post.Visibility == PostVisibility.FollowersOnly) return IsAcceptedFollower(author);

        return true;
    }

    public bool IsUserAccessible(User user) => IsDiscoverable(user.Id);

    public bool IsPostAccessible(Post post) => !post.IsDeleted && CanViewPost(post);

    /// <summary>
    /// Comment is accessible when its root post is, its author is discoverable and it is not deleted.
    /// </summary>
    public bool IsCommentAccessible(Comment comment, Post? rootPost)
        => !comment.IsDeleted && rootPost is not null && IsPostAccessible(rootPost) && IsDiscoverable(comment.AuthorId);

    #endregion

    #region Filters (callers MUST filter before paging and counting)

    public IReadOnlyList<User> FilterUsers(IEnumerable<User> users) => users.Where(IsUserAccessible).ToList();

    public IReadOnlyList<Post> FilterPosts(IEnumerable<Post> posts) => posts.Where(IsPostAccessible).ToList();

    public IReadOnlyList<Comment> FilterComments(IEnumerable<Comment> comments, Func<PostId, Post?> rootPostOf)
        => comments.Where(c => IsCommentAccessible(c, rootPostOf(c.PostId))).ToList();

    #endregion

    private bool IsAcceptedFollower(UserId ownerId)
        => _relations.TryGetValue(ownerId, out var relation) && relation.Status == FollowStatus.Accepted;
}
