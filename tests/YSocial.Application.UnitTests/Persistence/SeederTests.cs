using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
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
        posts.Should().OnlyContain(p => p.ImageUrl == null, "no stock images in the seed");
        users.Should().OnlyContain(u => u.ProfileInfo.AvatarUrl == null && u.ProfileInfo.CoverUrl == null);
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

    #region Discovery stage

    [Fact]
    public async Task Discovery_AddsTaggedPostsAndProfiles_WithHashtagRowsEqualToParserOutput()
    {
        using var db = _database.NewContext();
        await DevelopmentSeeder.SeedAsync(db);

        using var check = _database.NewContext();
        var tagged = await check.Posts.AsNoTracking().Include(p => p.Hashtags).Where(p => p.Hashtags.Any()).ToListAsync();

        tagged.Should().HaveCountGreaterThanOrEqualTo(60);
        foreach (var post in tagged)
        {
            post.Hashtags.Select(h => (h.Key, h.Display)).Should().BeEquivalentTo(HashtagParser.Extract(post.Content), $"post {post.Id.Value} (row order is not stored)");
        }

        tagged.SelectMany(p => p.Hashtags).Select(h => h.Key).Distinct().Should().Contain(["saigon", "dalat", "cafe", "code"]);
        tagged.Count(p => p.CreatedAt < DateTime.UtcNow.AddDays(-7)).Should().BeGreaterThan(5, "older posts exercise the window fallback");
        tagged.Count(p => p.CreatedAt >= DateTime.UtcNow.AddDays(-7)).Should().BeGreaterThan(20, "recent posts feed the 7-day window");
        (await check.Users.CountAsync(u => u.PrivacySettings.IsPrivateProfile)).Should().BeGreaterThanOrEqualTo(5);
        (await check.Users.CountAsync()).Should().BeGreaterThanOrEqualTo(35);
    }

    [Fact]
    public async Task Discovery_IsIdempotent()
    {
        using var db = _database.NewContext();
        await DevelopmentSeeder.SeedAsync(db);
        var first = await CountsAsync(db);
        var tags = await db.Set<PostHashtag>().CountAsync();

        using var again = _database.NewContext();
        await DevelopmentSeeder.SeedAsync(again);

        (await CountsAsync(again)).Should().Be(first);
        (await again.Set<PostHashtag>().CountAsync()).Should().Be(tags);
    }

    [Fact]
    public async Task Discovery_UpgradesAStage1OnlyDatabase_RemovingOnlyKnownStockUrlsOfSeedRows()
    {
        using (var db = _database.NewContext())
        {
            await DevelopmentSeeder.SeedBaseAsync(db);

            // Legacy stage 1 rows, a user-edited seed avatar and a non-seed (core) profile that happens to match the pattern
            var seedUsers = await db.Users.Where(u => u.Username == "an_nguyen" || u.Username == "binh_tran").ToListAsync();
            var legacy = seedUsers.Single(u => u.Username == "an_nguyen");
            var edited = seedUsers.Single(u => u.Username == "binh_tran");
            Rewrite(legacy, "https://i.pravatar.cc/150?u=an_nguyen", "https://picsum.photos/seed/an_nguyen/1200/400");
            Rewrite(edited, "https://cdn.example.com/mine.png", "https://picsum.photos/seed/binh_tran/1200/400");
            var core = await db.Users.SingleAsync(u => u.Id == SeedIds.TestUser);
            Rewrite(core, "https://i.pravatar.cc/150?u=test_user", null);

            var seedPost = await db.Posts.FirstAsync(p => p.Id == SeedIds.Post(3));
            db.Entry(seedPost).Property(p => p.ImageUrl).CurrentValue = "https://picsum.photos/seed/ysocial-0/800/600";
            var corePost = await db.Posts.SingleAsync(p => p.Id == SeedIds.TestPost);
            db.Entry(corePost).Property(p => p.ImageUrl).CurrentValue = "https://picsum.photos/seed/ysocial-5/800/600";
            await db.SaveChangesAsync();
        }

        using (var db = _database.NewContext())
        {
            await DevelopmentSeeder.SeedAsync(db);
        }

        using var check = _database.NewContext();
        var users = await check.Users.AsNoTracking().ToListAsync();
        users.Single(u => u.Username == "an_nguyen").ProfileInfo.Should().Match<UserProfileInfo>(i => i.AvatarUrl == null && i.CoverUrl == null);
        var keptEdit = users.Single(u => u.Username == "binh_tran").ProfileInfo;
        keptEdit.AvatarUrl.Should().Be("https://cdn.example.com/mine.png");
        keptEdit.CoverUrl.Should().BeNull("exact stock cover pattern of a seed row is removed even next to an edited avatar");
        users.Single(u => u.Id == SeedIds.TestUser).ProfileInfo.AvatarUrl.Should().Be("https://i.pravatar.cc/150?u=test_user", "core profile is not a development seed row");
        (await check.Posts.AsNoTracking().SingleAsync(p => p.Id == SeedIds.Post(3))).ImageUrl.Should().BeNull();
        (await check.Posts.AsNoTracking().SingleAsync(p => p.Id == SeedIds.TestPost)).ImageUrl.Should().NotBeNull("core post is not a development seed row");
    }

    private static void Rewrite(User user, string? avatar, string? cover)
        => user.UpdateProfile(new UserProfileInfo(user.ProfileInfo.DisplayName, user.ProfileInfo.Bio, avatar, cover,
            user.ProfileInfo.Gender, user.ProfileInfo.DateOfBirth, user.ProfileInfo.ProfileType));

    #endregion
}
