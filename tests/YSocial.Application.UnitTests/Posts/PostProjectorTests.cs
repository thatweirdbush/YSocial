using FluentAssertions;
using NSubstitute;
using Xunit;
using YSocial.Application.Features.Access;
using YSocial.Application.Features.Posts.Projection;
using YSocial.Domain.Comments;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;

namespace YSocial.Application.UnitTests.Posts;

public class PostProjectorTests
{
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IUserBlockRepository _blocks = Substitute.For<IUserBlockRepository>();
    private readonly IUserRelationRepository _relations = Substitute.For<IUserRelationRepository>();
    private readonly ILikeRepository _likes = Substitute.For<ILikeRepository>();
    private readonly ISavedItemRepository _saved = Substitute.For<ISavedItemRepository>();
    private readonly ICommentRepository _comments = Substitute.For<ICommentRepository>();
    private readonly IPostRepository _posts = Substitute.For<IPostRepository>();
    private readonly PostProjector _projector;

    private readonly User _viewer = NewUser("viewer");
    private readonly User _author = NewUser("author");

    public PostProjectorTests()
    {
        var policy = new ViewerAccessPolicy(_users, _blocks, _relations);
        _projector = new PostProjector(policy, _likes, _saved, _comments, _posts);

        _users.GetUsersByIdsAsync(Arg.Any<IEnumerable<UserId>>(), Arg.Any<CancellationToken>()).Returns(ci =>
        {
            var wanted = ci.Arg<IEnumerable<UserId>>().ToHashSet();
            return (IReadOnlyList<User>)AllUsers.Where(u => wanted.Contains(u.Id)).ToList();
        });
        _blocks.GetBlockedEitherWayAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlySet<UserId>)new HashSet<UserId>());
        _relations.GetRelationsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlyList<UserRelation>)[]);
        _likes.GetLikedTargetIdsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<Guid>>(), Arg.Any<LikeTargetType>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlySet<Guid>)new HashSet<Guid>());
        _saved.GetSavedTargetIdsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<Guid>>(), Arg.Any<SavedItemTargetType>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlySet<Guid>)new HashSet<Guid>());
        _comments.GetTopLevelCommentsByPostIdsAsync(Arg.Any<IReadOnlyCollection<PostId>>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlyList<CommentChildRow>)[]);
        _comments.GetChildCommentsByParentIdsAsync(Arg.Any<IReadOnlyCollection<CommentId>>(), Arg.Any<CancellationToken>())
            .Returns((IReadOnlyList<CommentChildRow>)[]);
        AllUsers = [_viewer, _author];
    }

    private List<User> AllUsers { get; set; } = [];

    private static User NewUser(string name)
    {
        var user = User.Create(AccountId.New(), name, Country.Vietnam, isDefault: true);
        user.ClearDomainEvents();
        return user;
    }

    [Fact]
    public async Task Projector_Comment_KindCommentParentIdPostId()
    {
        var post = Post.Create(_author.Id, "root", visibility: PostVisibility.Public);
        var top = Comment.Create(post.Id, _author.Id, "top");
        var reply = Comment.Create(post.Id, _viewer.Id, "reply", top.Id);
        _posts.GetByIdsAsync(Arg.Any<IReadOnlyCollection<PostId>>(), Arg.Any<CancellationToken>()).Returns((IReadOnlyList<Post>)[post]);

        var items = await _projector.ProjectAsync(_viewer.Id, [], [top, reply]);

        var topDto = items[top.Id.Value];
        topDto.Kind.Should().Be("comment");
        topDto.PostId.Should().Be(post.Id.Value);
        topDto.ParentId.Should().Be(post.Id.Value, "a top-level comment points at the root post");
        topDto.ImageUrl.Should().BeNull();
        topDto.Visibility.Should().Be("public");
        topDto.User.Username.Should().Be("author");
        var replyDto = items[reply.Id.Value];
        replyDto.ParentId.Should().Be(top.Id.Value);
        replyDto.PostId.Should().Be(post.Id.Value);
    }

    [Fact]
    public async Task Projector_Post_KindPost_NoParent_IsEditedFromUpdatedAt()
    {
        var post = Post.Create(_author.Id, "root", "https://img.test/a.png");
        post.UpdateContent(_author.Id, "edited");

        var items = await _projector.ProjectAsync(_viewer.Id, [post], []);

        var dto = items[post.Id.Value];
        dto.Kind.Should().Be("post");
        dto.ParentId.Should().BeNull();
        dto.PostId.Should().Be(post.Id.Value);
        dto.IsEdited.Should().BeTrue();
        dto.ImageUrl.Should().Be("https://img.test/a.png");
    }

    [Fact]
    public async Task Projector_ViewerFlags_UseTargetKind()
    {
        var post = Post.Create(_author.Id, "root");
        var comment = Comment.Create(post.Id, _author.Id, "c");
        _posts.GetByIdsAsync(Arg.Any<IReadOnlyCollection<PostId>>(), Arg.Any<CancellationToken>()).Returns((IReadOnlyList<Post>)[post]);
        _likes.GetLikedTargetIdsAsync(_viewer.Id, Arg.Any<IReadOnlyCollection<Guid>>(), LikeTargetType.Comment, Arg.Any<CancellationToken>())
            .Returns((IReadOnlySet<Guid>)new HashSet<Guid> { comment.Id.Value });
        _saved.GetSavedTargetIdsAsync(_viewer.Id, Arg.Any<IReadOnlyCollection<Guid>>(), SavedItemTargetType.Post, Arg.Any<CancellationToken>())
            .Returns((IReadOnlySet<Guid>)new HashSet<Guid> { post.Id.Value });

        var items = await _projector.ProjectAsync(_viewer.Id, [post], [comment]);

        items[comment.Id.Value].IsLikedByCurrentUser.Should().BeTrue();
        items[comment.Id.Value].IsBookmarkedByCurrentUser.Should().BeFalse();
        items[post.Id.Value].IsLikedByCurrentUser.Should().BeFalse();
        items[post.Id.Value].IsBookmarkedByCurrentUser.Should().BeTrue();
    }

    [Fact]
    public async Task Projector_Anonymous_NoViewerLookups()
    {
        var post = Post.Create(_author.Id, "root");

        var items = await _projector.ProjectAsync(null, [post], []);

        items[post.Id.Value].IsLikedByCurrentUser.Should().BeFalse();
        await _likes.DidNotReceiveWithAnyArgs().GetLikedTargetIdsAsync(default, default!, default!, default);
        await _saved.DidNotReceiveWithAnyArgs().GetSavedTargetIdsAsync(default, default!, default!, default);
    }

    [Fact]
    public async Task Projector_FixedRepoCallsPerPage()
    {
        var authors = Enumerable.Range(0, 5).Select(i => NewUser($"author{i}")).ToList();
        AllUsers = [_viewer, .. authors];
        var posts = Enumerable.Range(0, 20).Select(i => Post.Create(authors[i % 5].Id, $"post {i}")).ToList();

        var items = await _projector.ProjectAsync(_viewer.Id, posts, []);

        items.Should().HaveCount(20);
        await _users.Received(1).GetUsersByIdsAsync(Arg.Any<IEnumerable<UserId>>(), Arg.Any<CancellationToken>());
        await _blocks.Received(1).GetBlockedEitherWayAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>());
        await _relations.Received(1).GetRelationsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>());
        await _likes.Received(1).GetLikedTargetIdsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<Guid>>(), Arg.Any<LikeTargetType>(), Arg.Any<CancellationToken>());
        await _saved.Received(1).GetSavedTargetIdsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<Guid>>(), Arg.Any<SavedItemTargetType>(), Arg.Any<CancellationToken>());
        await _comments.Received(1).GetTopLevelCommentsByPostIdsAsync(Arg.Any<IReadOnlyCollection<PostId>>(), Arg.Any<CancellationToken>());
        await _comments.DidNotReceiveWithAnyArgs().GetChildCommentsByParentIdsAsync(default!, default);
    }

    [Fact]
    public async Task Projector_DropsInaccessibleItems()
    {
        var hidden = Post.Create(_author.Id, "private", visibility: PostVisibility.Private);
        var shown = Post.Create(_author.Id, "public");

        var items = await _projector.ProjectAsync(_viewer.Id, [hidden, shown], []);

        items.Keys.Should().BeEquivalentTo([shown.Id.Value]);
    }

    [Fact]
    public async Task Projector_CommentsCount_PostUsesTopLevel_CommentUsesChildren()
    {
        var post = Post.Create(_author.Id, "root");
        var top = Comment.Create(post.Id, _author.Id, "top");
        var ghost = NewUser("ghost"); // not in the user set: deleted author
        _posts.GetByIdsAsync(Arg.Any<IReadOnlyCollection<PostId>>(), Arg.Any<CancellationToken>()).Returns((IReadOnlyList<Post>)[post]);
        _comments.GetTopLevelCommentsByPostIdsAsync(Arg.Any<IReadOnlyCollection<PostId>>(), Arg.Any<CancellationToken>()).Returns((IReadOnlyList<CommentChildRow>)
        [
            new(post.Id.Value, top.Id, _author.Id),
            new(post.Id.Value, CommentId.New(), ghost.Id) // author deleted: not counted
        ]);
        _comments.GetChildCommentsByParentIdsAsync(Arg.Any<IReadOnlyCollection<CommentId>>(), Arg.Any<CancellationToken>()).Returns((IReadOnlyList<CommentChildRow>)
        [
            new(top.Id.Value, CommentId.New(), _viewer.Id),
            new(top.Id.Value, CommentId.New(), _viewer.Id)
        ]);

        var items = await _projector.ProjectAsync(_viewer.Id, [post], [top]);

        items[post.Id.Value].CommentsCount.Should().Be(1);
        items[top.Id.Value].CommentsCount.Should().Be(2);
    }

    [Fact]
    public async Task CommentCount_PostIdAndCommentIdQueriesNeverMix()
    {
        MockDataStore.ResetForTests();
        var repository = new MockCommentRepository();
        var postId = PostId.New();
        var top = Comment.Create(postId, UserId.New(), "top");
        var reply = Comment.Create(postId, UserId.New(), "reply", top.Id);
        var deleted = Comment.Create(postId, UserId.New(), "deleted");
        deleted.Delete(deleted.AuthorId, UserId.New());
        foreach (var comment in new[] { top, reply, deleted }) await repository.AddAsync(comment);

        var topLevel = await repository.GetTopLevelCommentsByPostIdsAsync([postId]);
        var children = await repository.GetChildCommentsByParentIdsAsync([top.Id]);
        var topLevelByCommentId = await repository.GetTopLevelCommentsByPostIdsAsync([new PostId(top.Id.Value)]);
        var childrenByPostId = await repository.GetChildCommentsByParentIdsAsync([new CommentId(postId.Value)]);

        topLevel.Select(r => r.CommentId).Should().Equal([top.Id], "replies & deleted comments are not top-level");
        topLevel.Single().ParentKey.Should().Be(postId.Value);
        children.Select(r => r.CommentId).Should().Equal([reply.Id]);
        children.Single().ParentKey.Should().Be(top.Id.Value);
        topLevelByCommentId.Should().BeEmpty("a comment id is never a post id");
        childrenByPostId.Should().BeEmpty("a post id is never a parent comment id");
        MockDataStore.ResetForTests();
    }
}
