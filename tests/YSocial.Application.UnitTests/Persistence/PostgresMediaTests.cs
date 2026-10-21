using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Media;
using YSocial.Domain.Posts;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Application.UnitTests.Persistence;

/// <summary>
/// Media on Npgsql (opt-in like <see cref="PostgresTests"/>): migration SQL, concurrency tokens and the sweep query.
/// SQLite cannot prove these: they are NOT claimed green unless the suite was run against a real server.
/// </summary>
public sealed class PostgresMediaTests
{
    private sealed class Unit(YSocialDbContext db) : IDisposable
    {
        private readonly UnitOfWork _unitOfWork = new(db, Substitute.For<IDomainEventsDispatcher>());

        public MediaAssetRepository Media => new(db, _unitOfWork);
        public PostRepository Posts => new(db, _unitOfWork);

        public Task CommitAsync() => _unitOfWork.CommitAsync();

        public void Dispose() => db.Dispose();
    }

    private static async Task<PostgresTests.TempDatabase> MigratedAsync()
    {
        var database = await PostgresTests.TempDatabase.CreateAsync();
        using var db = database.NewContext();
        await db.Database.MigrateAsync();
        await CoreSeeder.SeedAsync(db);
        return database;
    }

    private static MediaAsset Pending()
    {
        var asset = MediaAsset.Create(SeedIds.TestUser, MediaKind.Image, MediaPurpose.Post, "test");
        asset.MarkUploaded("https://res.cloudinary.com/demo/image/upload/x.jpg", null, 10, 10, null, 5);
        return asset;
    }

    [PostgresFact]
    public async Task MediaAsset_VersionToken_SecondWriterLoses_OnNpgsql()
    {
        await using var database = await MigratedAsync();
        var asset = Pending();
        using (var setup = new Unit(database.NewContext()))
        {
            await setup.Media.AddAsync(asset);
            await setup.CommitAsync();
        }

        using var first = new Unit(database.NewContext());
        using var second = new Unit(database.NewContext());
        var a = (await first.Media.GetByIdsAsync([asset.Id])).Single();
        var b = (await second.Media.GetByIdsAsync([asset.Id])).Single();
        a.MarkAttached(SeedIds.TestUser, MediaPurpose.Post);
        b.Claim(DateTime.UtcNow);
        await first.CommitAsync();

        await second.Invoking(u => u.CommitAsync()).Should().ThrowAsync<ConcurrencyConflictException>();
    }

    [PostgresFact]
    public async Task QuotaToken_ConcurrentReserves_SecondLoses_OnNpgsql()
    {
        await using var database = await MigratedAsync();
        using var first = new Unit(database.NewContext());
        using var second = new Unit(database.NewContext());

        await first.Media.BumpQuotaTokenAsync(SeedIds.TestUser);
        await second.Media.BumpQuotaTokenAsync(SeedIds.TestUser);
        await first.CommitAsync();

        await second.Invoking(u => u.CommitAsync()).Should().ThrowAsync<ConcurrencyConflictException>();
    }

    [PostgresFact]
    public async Task SweepBatch_AndReservedCount_WorkOnNpgsql()
    {
        await using var database = await MigratedAsync();
        var swept = Pending();
        var fresh = Pending();
        using (var setup = new Unit(database.NewContext()))
        {
            await setup.Media.AddAsync(swept);
            await setup.Media.AddAsync(fresh);
            await setup.CommitAsync();
        }

        using var read = new Unit(database.NewContext());
        var window = new MediaSweepWindow(DateTime.UtcNow.AddHours(-1), DateTime.UtcNow.AddHours(1), DateTime.UtcNow.AddHours(-1), DateTime.UtcNow.AddHours(-1));

        (await read.Media.GetSweepBatchAsync(window, 10)).Select(a => a.Id).Should().BeEquivalentTo([swept.Id, fresh.Id]);
        (await read.Media.GetSweepBatchAsync(window with { PendingBefore = DateTime.UtcNow.AddHours(-1) }, 10)).Should().BeEmpty();
        (await read.Media.CountReservedAsync(SeedIds.TestUser)).Should().Be(2);
    }

    [PostgresFact]
    public async Task PostMedia_RoundTripsInOrder_OnNpgsql()
    {
        await using var database = await MigratedAsync();
        var items = Enumerable.Range(0, 3)
            .Select(i => PostMedia.Create(MediaAssetId.New(), MediaKind.Image, $"https://res.cloudinary.com/demo/image/upload/{i}.jpg", null, 10, 10, null, i))
            .ToList();
        var post = Post.Create(SeedIds.TestUser, "media", media: items);

        using (var write = new Unit(database.NewContext()))
        {
            await write.Posts.AddAsync(post);
            await write.CommitAsync();
        }

        using var read = new Unit(database.NewContext());

        (await read.Posts.GetByIdsAsync([post.Id])).Single().Media.Select(m => m.MediaId).Should().Equal(items.Select(i => i.MediaId));
    }
}
