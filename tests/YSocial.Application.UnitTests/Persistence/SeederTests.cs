using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;
using YSocial.Domain.Likes;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserRelations;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Persistence;

public sealed class SeederTests : IDisposable
{
    private readonly SqliteTestDatabase _database = new();

    public void Dispose() => _database.Dispose();

    private async Task<Counts> CountsAsync(YSocialDbContext db) => new(
        await db.Accounts.CountAsync(), await db.Users.CountAsync(), await db.Posts.CountAsync(), await db.Comments.CountAsync(),
        await db.Likes.CountAsync(), await db.SavedItems.CountAsync(), await db.UserRelations.CountAsync(),
        await db.UserBlocks.CountAsync(), await db.Notifications.CountAsync());

    private sealed record Counts(int Accounts, int Users, int Posts, int Comments, int Likes, int Saved, int Relations, int Blocks, int Notifications);

    [Fact]
    public async Task Core_IsTheTestBaseline_AndIdempotent()
    {
        using var db = _database.NewContext();

        await CoreSeeder.SeedAsync(db);
        await CoreSeeder.SeedAsync(db);

        (await CountsAsync(db)).Should().Be(new Counts(3, 4, 2, 0, 0, 0, 0, 0, 0));
        (await db.Users.AnyAsync(u => u.Id == SeedIds.TestUser)).Should().BeTrue();
        (await db.Posts.AnyAsync(p => p.Id == SeedIds.TestPost)).Should().BeTrue();
    }

    [Fact]
    public async Task Development_IsRich_Idempotent_AndKeepsEveryCounterConsistent()
    {
        using var db = _database.NewContext();
        await DevelopmentSeeder.SeedAsync(db);
        var first = await CountsAsync(db);

        using (var again = _database.NewContext())
        {
            await DevelopmentSeeder.SeedAsync(again);
            (await CountsAsync(again)).Should().Be(first, "seeding twice must not duplicate anything");
        }

        first.Accounts.Should().BeGreaterThanOrEqualTo(15);
        first.Users.Should().BeGreaterThanOrEqualTo(17);
        first.Posts.Should().BeGreaterThan(40);
        first.Comments.Should().BeGreaterThan(15);
        first.Likes.Should().BeGreaterThan(30);
        first.Saved.Should().BeGreaterThan(5);
        first.Relations.Should().BeGreaterThan(30);
        first.Blocks.Should().Be(2);
        first.Notifications.Should().BeGreaterThan(30);

        using var check = _database.NewContext();
        var posts = await check.Posts.AsNoTracking().ToListAsync();
        var comments = await check.Comments.AsNoTracking().ToListAsync();
        var likes = await check.Likes.AsNoTracking().ToListAsync();
        var saved = await check.SavedItems.AsNoTracking().ToListAsync();
        var edges = await check.UserRelations.AsNoTracking().ToListAsync();
        var users = await check.Users.AsNoTracking().ToListAsync();

        foreach (var post in posts)
        {
            post.LikeCount.Should().Be(likes.Count(l => l.TargetType == LikeTargetType.Post && l.TargetId == post.Id.Value), $"likes of post {post.Id.Value}");
            post.SavedCount.Should().Be(saved.Count(s => s.TargetType == SavedItemTargetType.Post && s.TargetId == post.Id.Value), $"saves of post {post.Id.Value}");
        }

        foreach (var comment in comments)
        {
            comment.LikeCount.Should().Be(likes.Count(l => l.TargetType == LikeTargetType.Comment && l.TargetId == comment.Id.Value));
        }

        foreach (var user in users)
        {
            var accepted = edges.Where(e => !e.IsDeleted && e.FollowStatus == FollowStatus.Accepted).ToList();
            user.FollowersCount.Should().Be(accepted.Count(e => e.TargetId == user.Id), $"followers of {user.Username}");
            user.FollowingCount.Should().Be(accepted.Count(e => e.ObserverId == user.Id), $"following of {user.Username}");
        }

        edges.Should().Contain(e => e.FollowStatus == FollowStatus.Pending, "private profiles have pending requests");
        edges.Should().Contain(e => e.IsCloseFriend);
        edges.Should().Contain(e => e.IsMuted);
        users.Should().Contain(u => u.PrivacySettings.IsPrivateProfile);
        users.Select(u => u.Username).Should().OnlyHaveUniqueItems();
        posts.Should().Contain(p => p.ImageUrl != null);
        comments.Should().Contain(c => c.ParentCommentId != null, "threads with replies");

        var blocks = await check.UserBlocks.AsNoTracking().ToListAsync();
        foreach (var block in blocks)
        {
            edges.Should().NotContain(e => (e.ObserverId == block.ObserverId && e.TargetId == block.TargetId)
                                           || (e.ObserverId == block.TargetId && e.TargetId == block.ObserverId), "blocked pairs never follow each other");
        }
    }

    [Fact]
    public async Task Development_EveryAccountCanLogInWithTheKnownPassword()
    {
        using var db = _database.NewContext();
        await DevelopmentSeeder.SeedAsync(db);

        var hasher = new BCryptPasswordHasher();
        var accounts = await db.Accounts.AsNoTracking().Where(a => a.Email != "admin@admin.com").ToListAsync();

        accounts.Should().OnlyContain(a => hasher.Verify(a.PasswordHash.Value, SeedIds.TestPassword));
    }
}
