using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.Infrastructure.Persistence.UnitOfWork;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Persistence;

public sealed class PostHashtagRepositoryTests : IDisposable
{
    private readonly SqliteTestDatabase _database = new();
    private static readonly UserId Author = SeedIds.TestUser;

    public void Dispose() => _database.Dispose();

    private sealed class Unit(YSocialDbContext db) : IDisposable
    {
        private readonly UnitOfWork _unitOfWork = new(db, Substitute.For<IDomainEventsDispatcher>());

        public YSocialDbContext Db { get; } = db;

        public PostRepository Posts => new(Db, _unitOfWork);

        public Task CommitAsync() => _unitOfWork.CommitAsync();

        public void Dispose() => Db.Dispose();
    }

    private Unit NewUnit() => new(_database.NewContext());

    private async Task<Post> SaveAsync(string content)
    {
        using var unit = NewUnit();
        var post = Post.Create(Author, content);
        await unit.Posts.AddAsync(post);
        await unit.CommitAsync();
        return post;
    }

    [Fact]
    public async Task Create_PersistsHashtagRows_LoadedOnlyWhenIncluded()
    {
        var post = await SaveAsync("Morning #Coffee and #code");

        using var unit = NewUnit();
        (await unit.Posts.GetByIdAsync(post.Id))!.Hashtags.Should().BeEmpty("plain loads never carry tags");
        using var withTags = NewUnit();
        var loaded = await withTags.Posts.GetByIdWithHashtagsAsync(post.Id);

        loaded!.Hashtags.Select(h => (h.Key, h.Display)).Should().BeEquivalentTo([("coffee", "Coffee"), ("code", "code")]);
    }

    [Fact]
    public async Task Edit_SyncsRowsInTheSameSave_NoDuplicates()
    {
        var post = await SaveAsync("#keep #drop");

        using (var unit = NewUnit())
        {
            var loaded = (await unit.Posts.GetByIdWithHashtagsAsync(post.Id))!;
            loaded.UpdateContent(Author, "#Keep #added");
            await unit.CommitAsync();
        }

        using var check = _database.NewContext();
        var rows = await check.Set<PostHashtag>().AsNoTracking().OrderBy(h => h.Key).ToListAsync();
        rows.Select(h => (h.Key, h.Display)).Should().Equal(("added", "added"), ("keep", "Keep"));
    }

    [Fact]
    public async Task ByKey_ReturnsLiveTaggedPosts_WithTagsIncluded()
    {
        var live = await SaveAsync("#dalat trip");
        var deleted = await SaveAsync("#dalat gone");
        await SaveAsync("#other");
        using (var unit = NewUnit())
        {
            (await unit.Posts.GetByIdAsync(deleted.Id))!.Delete(Author);
            await unit.CommitAsync();
        }

        using var read = NewUnit();
        var posts = await read.Posts.GetByHashtagKeyAsync("dalat");

        posts.Select(p => p.Id).Should().Equal(live.Id);
        posts[0].Hashtags.Should().ContainSingle();
    }

    [Fact]
    public async Task Since_ReturnsOnlyTaggedPostsInsideTheWindow()
    {
        var recent = await SaveAsync("#fresh");
        var old = await SaveAsync("#stale");
        await SaveAsync("no tags here");
        using (var db = _database.NewContext())
        {
            (await db.Posts.FindAsync(old.Id))!.GetType().GetProperty(nameof(Post.CreatedAt))!
                .SetValue(await db.Posts.FindAsync(old.Id), DateTime.UtcNow.AddDays(-10));
            await db.SaveChangesAsync();
        }

        using var read = NewUnit();
        var posts = await read.Posts.GetWithHashtagsSinceAsync(DateTime.UtcNow.AddDays(-7));

        posts.Select(p => p.Id).Should().Equal(recent.Id);
        posts[0].Hashtags.Should().ContainSingle();
    }
}
