using FluentAssertions;
using NSubstitute;
using Xunit;
using YSocial.Application.Features.Access;
using YSocial.Domain.Comments;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Posts;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Application.UnitTests.Access;

public class ViewerAccessPolicyTests
{
    private readonly IUserRepository _users = Substitute.For<IUserRepository>();
    private readonly IUserBlockRepository _blocks = Substitute.For<IUserBlockRepository>();
    private readonly IUserRelationRepository _relations = Substitute.For<IUserRelationRepository>();
    private readonly ViewerAccessPolicy _policy;

    private readonly User _viewer = NewUser("viewer");
    private readonly User _author = NewUser("author");

    public ViewerAccessPolicyTests()
    {
        _policy = new ViewerAccessPolicy(_users, _blocks, _relations);
        _users.GetUsersByIdsAsync(Arg.Any<IEnumerable<UserId>>(), Arg.Any<CancellationToken>()).Returns(ci =>
        {
            var wanted = ci.Arg<IEnumerable<UserId>>().ToHashSet();
            return (IReadOnlyList<User>)Known.Where(u => wanted.Contains(u.Id)).ToList();
        });
        _blocks.GetBlockedEitherWayAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>())
            .Returns(ci => (IReadOnlySet<UserId>)Blocked.ToHashSet());
        _relations.GetRelationsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>())
            .Returns(ci => (IReadOnlyList<UserRelation>)Edges.ToList());
        Known = [_viewer, _author];
    }

    private List<User> Known { get; set; } = [];

    private List<UserId> Blocked { get; } = [];

    private List<UserRelation> Edges { get; } = [];

    private static User NewUser(string name, bool isPrivate = false)
    {
        var user = User.Create(AccountId.New(), name, Country.Vietnam, isDefault: true);
        if (isPrivate)
        {
            user.UpdatePrivacySettings(new PrivacySettings(true, true, true));
        }

        user.ClearDomainEvents();
        return user;
    }

    private static UserRelation Follow(User observer, User target, bool accepted = true)
    {
        var relation = UserRelation.Create(observer.Id, target.Id);
        relation.RequestFollow(isTargetPrivate: !accepted);
        relation.ClearDomainEvents();
        return relation;
    }

    private Task<ViewerAccessContext> ContextAsync(User? viewer, params User[] candidates)
        => _policy.GetContextAsync(viewer?.Id, candidates.Select(c => c.Id).ToList(), CancellationToken.None);

    private void MakePrivate(User user) => user.UpdatePrivacySettings(new PrivacySettings(true, true, true));

    [Fact]
    public async Task Owner_SeesOwnPrivate()
    {
        MakePrivate(_viewer);

        var context = await ContextAsync(_viewer, _viewer);

        context.CanViewContent(_viewer.Id).Should().BeTrue();
        context.IsDiscoverable(_viewer.Id).Should().BeTrue();
    }

    [Fact]
    public async Task Anonymous_VsPrivate_Locked()
    {
        MakePrivate(_author);

        var context = await ContextAsync(null, _author);

        context.IsDiscoverable(_author.Id).Should().BeTrue();
        context.CanViewContent(_author.Id).Should().BeFalse();
    }

    [Fact]
    public async Task Anonymous_VsPublic_Visible()
    {
        var context = await ContextAsync(null, _author);

        context.CanViewContent(_author.Id).Should().BeTrue();
        await _blocks.DidNotReceiveWithAnyArgs().GetBlockedEitherWayAsync(default, default!, default);
    }

    [Fact]
    public async Task Pending_VsPrivate_Locked()
    {
        MakePrivate(_author);
        Edges.Add(Follow(_viewer, _author, accepted: false));

        var context = await ContextAsync(_viewer, _author);

        context.CanViewContent(_author.Id).Should().BeFalse();
        context.RelationTo(_author.Id)!.Status.Should().Be(FollowStatus.Pending);
    }

    [Fact]
    public async Task Accepted_VsPrivate_Visible()
    {
        MakePrivate(_author);
        var edge = Follow(_viewer, _author);
        edge.AcceptFollow();
        Edges.Add(edge);

        var context = await ContextAsync(_viewer, _author);

        context.CanViewContent(_author.Id).Should().BeTrue();
    }

    [Fact]
    public async Task BlockEitherDirection_UndiscoverableForBoth()
    {
        Blocked.Add(_author.Id);

        var asViewer = await ContextAsync(_viewer, _author);
        asViewer.IsDiscoverable(_author.Id).Should().BeFalse();
        asViewer.IsUserAccessible(_author).Should().BeFalse();

        // The repo reports pairs symmetrically, so the blocked party sees nothing either
        Blocked.Clear();
        Blocked.Add(_viewer.Id);
        var asAuthor = await _policy.GetContextAsync(_author.Id, [_viewer.Id], CancellationToken.None);
        asAuthor.IsDiscoverable(_viewer.Id).Should().BeFalse();
    }

    [Fact]
    public async Task DeletedOrUnknownAuthor_Undiscoverable()
    {
        Known = [_viewer]; // repo never returns deleted users

        var context = await ContextAsync(_viewer, _author);

        context.IsDiscoverable(_author.Id).Should().BeFalse();
        context.CanViewPost(Post.Create(_author.Id, "hi")).Should().BeFalse();
    }

    [Fact]
    public async Task FollowersOnlyPost_VsNonFollower_Hidden_ButVisibleToFollowerAndAuthor()
    {
        var post = Post.Create(_author.Id, "followers only", visibility: PostVisibility.FollowersOnly);
        var nonFollower = await ContextAsync(_viewer, _author);
        nonFollower.IsPostAccessible(post).Should().BeFalse();

        Edges.Add(Follow(_viewer, _author));
        var follower = await ContextAsync(_viewer, _author);
        follower.IsPostAccessible(post).Should().BeTrue();

        var owner = await _policy.GetContextAsync(_author.Id, [_author.Id], CancellationToken.None);
        owner.IsPostAccessible(post).Should().BeTrue();
    }

    [Fact]
    public async Task PrivatePost_OnlyAuthor()
    {
        var post = Post.Create(_author.Id, "private", visibility: PostVisibility.Private);
        Edges.Add(Follow(_viewer, _author));

        var follower = await ContextAsync(_viewer, _author);
        var owner = await _policy.GetContextAsync(_author.Id, [_author.Id], CancellationToken.None);

        follower.IsPostAccessible(post).Should().BeFalse();
        owner.IsPostAccessible(post).Should().BeTrue();
    }

    [Fact]
    public async Task DeletedPost_Inaccessible()
    {
        var post = Post.Create(_author.Id, "gone");
        post.Delete(_author.Id);

        var context = await ContextAsync(_viewer, _author);

        context.IsPostAccessible(post).Should().BeFalse();
    }

    [Fact]
    public async Task DormantCloseFriendFlag_GrantsNothing()
    {
        MakePrivate(_author);
        var edge = Follow(_viewer, _author);
        edge.ToggleCloseFriend(true);
        edge.Delete(); // unfollowed: flag stays dormant
        Edges.Add(edge);

        var context = await ContextAsync(_viewer, _author);

        context.CanViewContent(_author.Id).Should().BeFalse();
        context.RelationTo(_author.Id)!.Status.Should().Be(FollowStatus.None);
        context.RelationTo(_author.Id)!.IsCloseFriend.Should().BeTrue("the flag is reported, but never grants access");
    }

    [Fact]
    public async Task Comment_UnderInaccessibleRootPost_Inaccessible()
    {
        var post = Post.Create(_author.Id, "private", visibility: PostVisibility.Private);
        var comment = Comment.Create(post.Id, _author.Id, "reply");

        var context = await ContextAsync(_viewer, _author);

        context.IsCommentAccessible(comment, post).Should().BeFalse();
    }

    [Fact]
    public async Task Comment_ByBlockedAuthor_UnderAccessiblePost_Inaccessible()
    {
        var post = Post.Create(_author.Id, "public");
        var commenter = NewUser("commenter");
        Known = [_viewer, _author, commenter];
        Blocked.Add(commenter.Id);
        var comment = Comment.Create(post.Id, commenter.Id, "reply");

        var context = await ContextAsync(_viewer, _author, commenter);

        context.IsPostAccessible(post).Should().BeTrue();
        context.IsCommentAccessible(comment, post).Should().BeFalse();
    }

    [Fact]
    public async Task Comment_Deleted_Inaccessible()
    {
        var post = Post.Create(_author.Id, "public");
        var comment = Comment.Create(post.Id, _author.Id, "reply");
        comment.Delete(_author.Id, _author.Id);

        var context = await ContextAsync(_viewer, _author);

        context.IsCommentAccessible(comment, post).Should().BeFalse();
    }

    [Fact]
    public async Task FilterHelpers_DropInaccessibleEntities()
    {
        var visible = Post.Create(_author.Id, "ok");
        var hidden = Post.Create(_author.Id, "hidden", visibility: PostVisibility.Private);
        var context = await ContextAsync(_viewer, _author);

        context.FilterPosts([visible, hidden]).Should().Equal(visible);
        context.FilterUsers([_author, NewUser("stranger")]).Should().Equal(_author);
    }

    [Fact]
    public async Task GetContext_CallsEachRepoOnce_For50Candidates()
    {
        var candidates = Enumerable.Range(0, 50).Select(i => NewUser($"user{i}")).ToArray();
        Known = [_viewer, .. candidates];

        await ContextAsync(_viewer, candidates);

        await _users.Received(1).GetUsersByIdsAsync(Arg.Any<IEnumerable<UserId>>(), Arg.Any<CancellationToken>());
        await _blocks.Received(1).GetBlockedEitherWayAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>());
        await _relations.Received(1).GetRelationsAsync(Arg.Any<UserId>(), Arg.Any<IReadOnlyCollection<UserId>>(), Arg.Any<CancellationToken>());
    }
}
