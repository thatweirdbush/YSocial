using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Comments;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.UnitOfWork;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Persistence;

/// <summary>
/// EF repositories over a throw-away SQLite database. Every "reload" uses a NEW context: what the first context
/// did not save is not there (production reality: 1 context per request).
/// </summary>
public sealed class RepositoryTests : IDisposable
{
    private readonly SqliteTestDatabase _database = new();
    private readonly BCryptPasswordHasher _hasher = new(4);

    public void Dispose() => _database.Dispose();

    private sealed class Unit(YSocialDbContext db) : IDisposable
    {
        public YSocialDbContext Db { get; } = db;

        public UnitOfWork UnitOfWork { get; } = new(db, Substitute.For<IDomainEventsDispatcher>());

        public AccountRepository Accounts => new(Db, UnitOfWork);
        public UserRepository Users => new(Db, UnitOfWork);
        public PostRepository Posts => new(Db, UnitOfWork);
        public CommentRepository Comments => new(Db, UnitOfWork);
        public LikeRepository Likes => new(Db, UnitOfWork);

        public Task CommitAsync() => UnitOfWork.CommitAsync();

        public void Dispose() => Db.Dispose();
    }

    private Unit NewUnit() => new(_database.NewContext());

    private Account NewAccount(string email = "new@example.com")
        => Account.Create(email, null, PasswordHash.Create(_hasher.Hash("Password123!")));

    private async Task<Account> SaveAccountAsync(string email = "new@example.com")
    {
        using var unit = NewUnit();
        var account = NewAccount(email);
        await unit.Accounts.AddAsync(account);
        await unit.CommitAsync();
        return account;
    }

    #region Account aggregate

    [Fact]
    public async Task Account_RoundTrip_PersistsTokensResetTokensAndValueObjects()
    {
        var account = NewAccount();
        var profileId = UserId.New();
        account.AddRefreshToken("device-1", profileId);
        account.AddRefreshToken("device-2", profileId);
        account.GeneratePasswordResetToken(_hasher);

        using (var unit = NewUnit())
        {
            await unit.Accounts.AddAsync(account);
            await unit.CommitAsync();
        }

        using var reload = NewUnit();
        var stored = await reload.Accounts.GetByIdAsync(account.Id);

        stored.Should().NotBeNull();
        stored!.Email.Should().Be("new@example.com");
        stored.Role.Should().Be(UserRole.Member);
        stored.PasswordHash.Value.Should().Be(account.PasswordHash.Value);
        stored.CreatedAt.Kind.Should().Be(DateTimeKind.Utc);
        stored.RefreshTokens.Should().HaveCount(2).And.OnlyContain(t => t.UserId == profileId && t.IsActive);
        stored.PasswordResetTokens.Should().ContainSingle();
    }

    [Fact]
    public async Task Account_AddTokenToStoredAccount_InsertsChild_NoUpdateOfNewRow()
    {
        var account = await SaveAccountAsync();

        for (var i = 0; i < 2; i++)
        {
            using var unit = NewUnit();
            var loaded = (await unit.Accounts.GetByIdAsync(account.Id))!;
            loaded.AddRefreshToken($"device-{i}", UserId.New());
            unit.Accounts.Update(loaded);
            await unit.CommitAsync();
        }

        using var reload = NewUnit();
        (await reload.Accounts.GetByIdAsync(account.Id))!.RefreshTokens.Should().HaveCount(2);
    }

    [Fact]
    public async Task Account_DroppedTokens_AreDeletedFromDatabase()
    {
        var account = await SaveAccountAsync();

        using (var unit = NewUnit())
        {
            var loaded = (await unit.Accounts.GetByIdAsync(account.Id))!;
            loaded.AddRefreshToken("old", UserId.New());
            await unit.CommitAsync();
        }

        using (var unit = NewUnit())
        {
            var loaded = (await unit.Accounts.GetByIdAsync(account.Id))!;
            loaded.RevokeAllRefreshTokens();
            loaded.AddRefreshToken("new", UserId.New());   // purges the revoked one
            await unit.CommitAsync();
        }

        using var reload = NewUnit();
        (await reload.Accounts.GetByIdAsync(account.Id))!.RefreshTokens.Should().ContainSingle(t => t.DeviceId == "new");
        (await reload.Db.Set<RefreshToken>().CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Account_ConcurrentWriters_SecondSaveFailsWithConflict()
    {
        var account = await SaveAccountAsync();

        using var first = NewUnit();
        using var second = NewUnit();
        var a = (await first.Accounts.GetByIdAsync(account.Id))!;
        var b = (await second.Accounts.GetByIdAsync(account.Id))!;

        a.AddRefreshToken("first", UserId.New());
        b.AddRefreshToken("second", UserId.New());

        await first.CommitAsync();
        var act = () => second.CommitAsync();

        await act.Should().ThrowAsync<ConcurrencyConflictException>();
    }

    [Fact]
    public async Task Account_LookupByRefreshToken_IsUntrackedSnapshot()
    {
        var account = NewAccount();
        var token = account.AddRefreshToken("device", UserId.New());
        using (var unit = NewUnit())
        {
            await unit.Accounts.AddAsync(account);
            await unit.CommitAsync();
        }

        using var reload = NewUnit();
        var found = await reload.Accounts.GetByRefreshTokenAsync(token.Token);

        found!.Id.Should().Be(account.Id);
        found.RefreshTokens.Should().ContainSingle();
        reload.Db.ChangeTracker.Entries().Should().BeEmpty("advisory lookups must not pin stale state in the request's identity map");
    }

    [Fact]
    public async Task Account_LoginIdentifier_EmailPhoneUsername_CaseInsensitive_DeletedHidden()
    {
        using (var unit = NewUnit())
        {
            var account = Account.Create("Mixed.Case@Example.com", "+84901234567", PasswordHash.Create(_hasher.Hash("Password123!")));
            await unit.Accounts.AddAsync(account);
            await unit.Users.AddAsync(User.Create(account.Id, "mixed_user", Country.Vietnam, isDefault: true));
            await unit.CommitAsync();
        }

        using var reload = NewUnit();

        (await reload.Accounts.GetByIdentifierAsync("mixed.case@example.COM")).Should().NotBeNull();
        (await reload.Accounts.GetByIdentifierAsync("+84901234567")).Should().NotBeNull();
        (await reload.Accounts.GetByIdentifierAsync("MIXED_user")).Should().NotBeNull();
        (await reload.Accounts.GetByIdentifierAsync("nobody")).Should().BeNull();

        var (account2, profiles) = await reload.Accounts.GetAccountWithProfilesByIdentifierAsync("mixed_user");
        account2.Should().NotBeNull();
        profiles.Should().ContainSingle(p => p.Username == "mixed_user");

        var id = await reload.Accounts.GetIdByIdentifierAsync("mixed_user");
        id.Should().Be(account2!.Id);

        var stored = (await reload.Accounts.GetByIdentifierAsync("mixed_user"))!;
        stored.Delete();
        await reload.CommitAsync();

        using var afterDelete = NewUnit();
        (await afterDelete.Accounts.GetByIdentifierAsync("mixed_user")).Should().BeNull();
        (await afterDelete.Accounts.GetByIdAsync(stored.Id)).Should().BeNull("soft-deleted accounts are hidden");
        (await afterDelete.Accounts.GetByIdAsync(stored.Id, includeDeleted: true)).Should().NotBeNull();
    }

    #endregion

    #region Users

    [Fact]
    public async Task Users_UsernameAndEmailReservation_IncludesSoftDeleted_CaseInsensitive()
    {
        using (var unit = NewUnit())
        {
            var account = NewAccount("Taken@Example.com");
            var user = User.Create(account.Id, "taken_name", Country.Vietnam, isDefault: true);
            user.Delete(isAccountDeletion: true);
            account.Delete();
            await unit.Accounts.AddAsync(account);
            await unit.Users.AddAsync(user);
            await unit.CommitAsync();
        }

        using var reload = NewUnit();

        (await reload.Users.IsUsernameTakenAsync("TAKEN_name")).Should().BeTrue("usernames are never recycled");
        (await reload.Users.IsUsernameTakenAsync("free_name")).Should().BeFalse();
        (await reload.Users.IsEmailUniqueAsync("taken@example.com")).Should().BeFalse("emails stay reserved after deletion");
        (await reload.Users.IsEmailUniqueAsync("free@example.com")).Should().BeTrue();
        (await reload.Users.GetByUsernameAsync("taken_name")).Should().BeNull("deleted profiles are not resolvable");
    }

    [Fact]
    public async Task Users_RoundTrip_ConvertsEnumerationsCountryDatesAndOwnedValueObjects()
    {
        var birth = new DateTime(1990, 5, 17);
        var userId = UserId.New();

        using (var unit = NewUnit())
        {
            var user = User.Create(AccountId.New(), "round_trip", Country.Vietnam, isDefault: true);
            user.UpdateProfile(new UserProfileInfo("Round Trip", "bio", "https://img.test/a.png", "https://img.test/c.png", Gender.Female, birth, ProfileType.Creator));
            user.UpdatePrivacySettings(new PrivacySettings(true, false, true));
            await unit.Users.AddAsync(user);
            await unit.CommitAsync();
            userId = user.Id;
        }

        using var reload = NewUnit();
        var stored = (await reload.Users.GetByIdAsync(userId))!;

        stored.Country.Should().Be(Country.Vietnam);
        stored.ProfileInfo.Gender.Should().Be(Gender.Female);
        stored.ProfileInfo.ProfileType.Should().Be(ProfileType.Creator);
        stored.ProfileInfo.DateOfBirth.Should().Be(birth, "a date of birth is a calendar date: no time zone shifting");
        stored.ProfileInfo.DisplayName.Should().Be("Round Trip");
        stored.PrivacySettings.Should().Be(new PrivacySettings(true, false, true));
        stored.CreatedAt.Kind.Should().Be(DateTimeKind.Utc);
    }

    #endregion

    #region Content

    [Fact]
    public async Task Comments_TopLevelAndChildQueries_NeverMixPostAndCommentIds()
    {
        var postId = PostId.New();
        var top = Comment.Create(postId, UserId.New(), "top");
        var reply = Comment.Create(postId, UserId.New(), "reply", top.Id);
        var deleted = Comment.Create(postId, UserId.New(), "deleted");
        deleted.Delete(deleted.AuthorId, UserId.New());

        using (var unit = NewUnit())
        {
            foreach (var comment in new[] { top, reply, deleted }) await unit.Comments.AddAsync(comment);
            await unit.CommitAsync();
        }

        using var reload = NewUnit();
        var topLevel = await reload.Comments.GetTopLevelCommentsByPostIdsAsync([postId]);
        var children = await reload.Comments.GetChildCommentsByParentIdsAsync([top.Id]);
        var topLevelByCommentId = await reload.Comments.GetTopLevelCommentsByPostIdsAsync([new PostId(top.Id.Value)]);
        var childrenByPostId = await reload.Comments.GetChildCommentsByParentIdsAsync([new CommentId(postId.Value)]);

        topLevel.Select(r => r.CommentId).Should().Equal([top.Id], "replies & deleted comments are not top-level");
        topLevel.Single().ParentKey.Should().Be(postId.Value);
        children.Select(r => r.CommentId).Should().Equal([reply.Id]);
        children.Single().ParentKey.Should().Be(top.Id.Value);
        topLevelByCommentId.Should().BeEmpty("a comment id is never a post id");
        childrenByPostId.Should().BeEmpty("a post id is never a parent comment id");
    }

    [Fact]
    public async Task Posts_SoftDeleted_HiddenFromReads_VisibleWhenIncluded()
    {
        var author = UserId.New();
        var live = Post.Create(author, "live");
        var gone = Post.Create(author, "gone");
        gone.Delete(author);

        using (var unit = NewUnit())
        {
            await unit.Posts.AddAsync(live);
            await unit.Posts.AddAsync(gone);
            await unit.CommitAsync();
        }

        using var reload = NewUnit();

        (await reload.Posts.GetByIdAsync(gone.Id)).Should().BeNull();
        (await reload.Posts.GetByIdAsync(gone.Id, includeDeleted: true)).Should().NotBeNull();
        (await reload.Posts.GetByAuthorIdAsync(author)).Should().ContainSingle(p => p.Id == live.Id);
        (await reload.Posts.GetByIdsAsync([live.Id, gone.Id])).Should().ContainSingle(p => p.Id == live.Id);
        (await reload.Posts.GetAllAsync()).Should().Contain(p => p.Id == live.Id).And.NotContain(p => p.Id == gone.Id);
    }

    [Fact]
    public async Task Likes_NestedEnumerationType_RoundTrips_AndDuplicatesAreRejectedByTheDatabase()
    {
        var user = UserId.New();
        var target = Guid.NewGuid();

        using (var unit = NewUnit())
        {
            await unit.Likes.AddAsync(Like.Create(target, LikeTargetType.Comment, user, UserId.New()));
            await unit.CommitAsync();
        }

        using var reload = NewUnit();
        var stored = await reload.Likes.GetByUserAndTargetAsync(user, target, LikeTargetType.Comment);
        stored.Should().NotBeNull();
        stored!.TargetType.Should().Be(LikeTargetType.Comment);
        (await reload.Likes.GetByUserAndTargetAsync(user, target, LikeTargetType.Post)).Should().BeNull();
        (await reload.Likes.GetLikedTargetIdsAsync(user, [target, Guid.NewGuid()], LikeTargetType.Comment)).Should().BeEquivalentTo([target]);

        await reload.Likes.AddAsync(Like.Create(target, LikeTargetType.Comment, user, UserId.New()));
        var act = () => reload.CommitAsync();

        await act.Should().ThrowAsync<DbUpdateException>("1 like per user & target is a unique index (race safety)");
    }

    #endregion

    #region Change tracking & events

    [Fact]
    public async Task DrainDomainEvents_CoversNewModifiedAndHardRemovedAggregates_ThenIsEmpty()
    {
        var user = UserId.New();
        var like = Like.Create(Guid.NewGuid(), LikeTargetType.Post, user, UserId.New());
        like.ClearDomainEvents();
        using (var unit = NewUnit())
        {
            await unit.Likes.AddAsync(like);
            await unit.CommitAsync();
        }

        using var request = NewUnit();
        var loaded = (await request.Likes.GetByUserAndTargetAsync(user, like.TargetId, LikeTargetType.Post))!;
        loaded.Remove();
        request.Likes.Remove(loaded);                                   // hard delete (entity leaves the table)
        await request.Posts.AddAsync(Post.Create(user, "new post"));    // new aggregate

        var events = request.Db.DrainDomainEvents();

        events.Select(e => e.GetType().Name).Should().BeEquivalentTo(["LikeRemovedEvent", "PostCreatedEvent"]);
        request.Db.DrainDomainEvents().Should().BeEmpty("draining clears the aggregates");
    }

    [Fact]
    public async Task Discard_DropsPendingEvents()
    {
        using var request = NewUnit();
        await request.Posts.AddAsync(Post.Create(UserId.New(), "p"));

        var dropped = request.Db.Discard();

        dropped.Should().ContainSingle();
        request.Db.DrainDomainEvents().Should().BeEmpty();
    }

    [Fact]
    public async Task Update_TrackedEntity_IsNoOp_DetachedEntity_IsAttachedAsModified()
    {
        var author = UserId.New();
        var post = Post.Create(author, "v1");
        using (var unit = NewUnit())
        {
            await unit.Posts.AddAsync(post);
            await unit.CommitAsync();
        }

        using (var tracked = NewUnit())
        {
            var loaded = (await tracked.Posts.GetByIdAsync(post.Id))!;
            tracked.Posts.Update(loaded);
            tracked.Db.Entry(loaded).State.Should().Be(EntityState.Unchanged);
        }

        using (var detached = NewUnit())
        {
            post.UpdateContent(author, "v2");
            detached.Posts.Update(post);
            detached.Db.Entry(post).State.Should().Be(EntityState.Modified);
            await detached.CommitAsync();
        }

        using var reload = NewUnit();
        (await reload.Posts.GetByIdAsync(post.Id))!.Content.Should().Be("v2");
    }

    [Fact]
    public async Task FailedRequest_NothingSaved_UntilCommit()
    {
        var post = Post.Create(UserId.New(), "never saved");

        using (var unit = NewUnit())
        {
            await unit.Posts.AddAsync(post);
            // request fails here: no commit
        }

        using var reload = NewUnit();
        (await reload.Posts.GetByIdAsync(post.Id)).Should().BeNull();
    }

    #endregion
}
