using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using NSubstitute;
using Xunit;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Media;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.Infrastructure.Persistence.UnitOfWork;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Persistence;

/// <summary>
/// Media repo over a throw-away SQLite database: every reload uses a NEW context (1 context per request in production).
/// </summary>
public sealed class MediaAssetRepositoryTests : IDisposable
{
    private readonly SqliteTestDatabase _database = new();
    private static readonly UserId Owner = SeedIds.TestUser;
    private static readonly UserId Other = SeedIds.DemoUser;

    public void Dispose() => _database.Dispose();

    private sealed class Unit(YSocialDbContext db) : IDisposable
    {
        public YSocialDbContext Db { get; } = db;

        public UnitOfWork UnitOfWork { get; } = new(db, Substitute.For<IDomainEventsDispatcher>());

        public MediaAssetRepository Media => new(Db, UnitOfWork);
        public PostRepository Posts => new(Db, UnitOfWork);

        public Task CommitAsync() => UnitOfWork.CommitAsync();

        public void Dispose() => Db.Dispose();
    }

    private Unit NewUnit() => new(_database.NewContext());

    private async Task<MediaAsset> SaveAsync(UserId? owner = null, Action<MediaAsset>? shape = null, MediaPurpose? purpose = null)
    {
        using var unit = NewUnit();
        var asset = MediaAsset.Create(owner ?? Owner, MediaKind.Image, purpose ?? MediaPurpose.Post, "test");
        shape?.Invoke(asset);
        await unit.Media.AddAsync(asset);
        await unit.CommitAsync();
        return asset;
    }

    private static void ToPending(MediaAsset asset)
        => asset.MarkUploaded($"https://res.cloudinary.com/demo/image/upload/{asset.Id.Value:N}.jpg", null, 800, 600, null, 100);

    private static void ToAttached(MediaAsset asset, MediaPurpose? purpose = null)
    {
        ToPending(asset);
        asset.MarkAttached(Owner, purpose ?? MediaPurpose.Post);
    }

    private static MediaSweepWindow EverythingOld() => new(DateTime.UtcNow.AddMinutes(5), DateTime.UtcNow.AddMinutes(5), DateTime.UtcNow.AddMinutes(5), DateTime.UtcNow.AddMinutes(5));

    private static MediaSweepWindow NothingOld() => new(DateTime.UtcNow.AddHours(-1), DateTime.UtcNow.AddHours(-1), DateTime.UtcNow.AddHours(-1), DateTime.UtcNow.AddHours(-1));

    [Fact]
    public async Task Asset_RoundTrips_AllFields()
    {
        var saved = await SaveAsync(shape: a => a.MarkUploaded("https://res.cloudinary.com/demo/video/upload/x.mp4", "https://res.cloudinary.com/demo/video/upload/so_0/x.jpg", 1920, 1080, 12.5, 4096));

        using var unit = NewUnit();
        var loaded = (await unit.Media.GetByIdsAsync([saved.Id])).Single();

        loaded.Should().BeEquivalentTo(saved, o => o.Excluding(a => a.DomainEvents));
        loaded.Status.Should().Be(MediaAssetStatus.Pending);
    }

    [Fact]
    public async Task GetByIds_UnknownIdsAreAbsent()
    {
        var saved = await SaveAsync();

        using var unit = NewUnit();

        (await unit.Media.GetByIdsAsync([saved.Id, MediaAssetId.New()])).Select(a => a.Id).Should().Equal(saved.Id);
    }

    [Fact]
    public async Task Version_IsConcurrencyToken_SecondWriterLoses()
    {
        var saved = await SaveAsync(shape: ToPending);

        using var first = NewUnit();
        using var second = NewUnit();
        var a = (await first.Media.GetByIdsAsync([saved.Id])).Single();
        var b = (await second.Media.GetByIdsAsync([saved.Id])).Single();

        a.MarkAttached(Owner, MediaPurpose.Post);
        b.Claim(DateTime.UtcNow);
        await first.CommitAsync();

        var act = () => second.CommitAsync();

        await act.Should().ThrowAsync<ConcurrencyConflictException>();
    }

    [Fact]
    public async Task CountReserved_CountsOnlyUploadingAndPending_OfTheOwner()
    {
        await SaveAsync();                                             // Uploading
        await SaveAsync(shape: ToPending);                             // Pending
        await SaveAsync(shape: a => ToAttached(a));                    // Attached
        await SaveAsync(shape: a => { ToAttached(a); a.Release(); });  // Released
        await SaveAsync(shape: a => a.Claim(DateTime.UtcNow));         // Deleting
        await SaveAsync(Other);                                        // foreign Uploading

        using var unit = NewUnit();

        (await unit.Media.CountReservedAsync(Owner)).Should().Be(2);
    }

    [Fact]
    public async Task SweepBatch_ReturnsEveryDeletableStatus_NeverAttached()
    {
        var uploading = await SaveAsync();
        var pending = await SaveAsync(shape: ToPending);
        var released = await SaveAsync(shape: a => { ToAttached(a); a.Release(); });
        var deleting = await SaveAsync(shape: a => a.Claim(DateTime.UtcNow));
        await SaveAsync(shape: a => ToAttached(a));

        using var unit = NewUnit();
        var batch = await unit.Media.GetSweepBatchAsync(EverythingOld(), 50);

        batch.Select(a => a.Id).Should().BeEquivalentTo([uploading.Id, pending.Id, released.Id, deleting.Id]);
    }

    [Fact]
    public async Task SweepBatch_SkipsRowsThatAreNotOldEnough()
    {
        await SaveAsync();
        await SaveAsync(shape: ToPending);
        await SaveAsync(shape: a => { ToAttached(a); a.Release(); });
        await SaveAsync(shape: a => a.Claim(DateTime.UtcNow));

        using var unit = NewUnit();

        (await unit.Media.GetSweepBatchAsync(NothingOld(), 50)).Should().BeEmpty();
    }

    [Fact]
    public async Task SweepBatch_RespectsEachStatusOwnCutOff()
    {
        var pending = await SaveAsync(shape: ToPending);
        await SaveAsync(shape: a => a.Claim(DateTime.UtcNow));

        var window = NothingOld() with { PendingBefore = DateTime.UtcNow.AddMinutes(5) };

        using var unit = NewUnit();

        (await unit.Media.GetSweepBatchAsync(window, 50)).Select(a => a.Id).Should().Equal(pending.Id);
    }

    [Fact]
    public async Task SweepBatch_IsBoundedAndOldestFirst()
    {
        var first = await SaveAsync();
        await Task.Delay(20);
        await SaveAsync();
        await Task.Delay(20);
        await SaveAsync();

        using var unit = NewUnit();
        var batch = await unit.Media.GetSweepBatchAsync(EverythingOld(), 2);

        batch.Should().HaveCount(2);
        batch[0].Id.Should().Be(first.Id);
    }

    [Fact]
    public async Task GetAttachedAvatar_MatchesOwnerPurposeStatusAndUrl()
    {
        var avatar = await SaveAsync(purpose: MediaPurpose.Avatar, shape: a => ToAttachedAvatar(a));
        await SaveAsync(Other, purpose: MediaPurpose.Avatar, shape: a => ToAttachedAvatar(a, Other));

        using var unit = NewUnit();

        (await unit.Media.GetAttachedAvatarAsync(Owner, avatar.Url!))!.Id.Should().Be(avatar.Id);
        (await unit.Media.GetAttachedAvatarAsync(Other, avatar.Url!)).Should().BeNull();
        (await unit.Media.GetAttachedAvatarAsync(Owner, "https://elsewhere/a.jpg")).Should().BeNull();
    }

    [Fact]
    public async Task GetAttachedAvatar_IgnoresPostAssetsAndNonAttached()
    {
        var post = await SaveAsync(shape: a => ToAttached(a));
        var pendingAvatar = await SaveAsync(purpose: MediaPurpose.Avatar, shape: ToPending);

        using var unit = NewUnit();

        (await unit.Media.GetAttachedAvatarAsync(Owner, post.Url!)).Should().BeNull();
        (await unit.Media.GetAttachedAvatarAsync(Owner, pendingAvatar.Url!)).Should().BeNull();
    }

    [Fact]
    public async Task QuotaToken_ConcurrentReserves_SecondCommitLoses()
    {
        using var first = NewUnit();
        using var second = NewUnit();

        await first.Media.BumpQuotaTokenAsync(Owner);
        await second.Media.BumpQuotaTokenAsync(Owner);
        await first.CommitAsync();

        var act = () => second.CommitAsync();

        await act.Should().ThrowAsync<ConcurrencyConflictException>();
    }

    [Fact]
    public async Task QuotaToken_SequentialReserves_BothSucceed()
    {
        using (var first = NewUnit())
        {
            await first.Media.BumpQuotaTokenAsync(Owner);
            await first.CommitAsync();
        }

        using var second = NewUnit();
        await second.Media.BumpQuotaTokenAsync(Owner);

        await second.Invoking(u => u.CommitAsync()).Should().NotThrowAsync();
    }

    [Fact]
    public async Task PostMedia_RoundTrips_InOrder_WithoutExplicitInclude()
    {
        var items = Enumerable.Range(0, 3)
            .Select(i => PostMedia.Create(MediaAssetId.New(), i == 1 ? MediaKind.Video : MediaKind.Image, $"https://res.cloudinary.com/demo/image/upload/{i}.jpg", i == 1 ? "https://p/p.jpg" : null, 100 + i, 200 + i, i == 1 ? 3.5 : null))
            .ToList();
        var post = Post.Create(Owner, "with media", media: items);

        using (var unit = NewUnit())
        {
            await unit.Posts.AddAsync(post);
            await unit.CommitAsync();
        }

        using var read = NewUnit();
        var byId = await read.Posts.GetByIdAsync(post.Id);
        var byIds = (await read.Posts.GetByIdsAsync([post.Id])).Single();

        foreach (var loaded in new[] { byId!, byIds })
        {
            loaded.Media.Select(m => m.Position).Should().Equal(0, 1, 2);
            loaded.Media.Select(m => m.MediaId).Should().Equal(items.Select(i => i.MediaId));
            loaded.Media[1].Should().Match<PostMedia>(m => m.Kind == MediaKind.Video && m.PosterUrl == "https://p/p.jpg" && m.DurationSeconds == 3.5);
        }
    }

    private static void ToAttachedAvatar(MediaAsset asset, UserId? owner = null)
    {
        ToPending(asset);
        asset.MarkAttached(owner ?? Owner, MediaPurpose.Avatar);
    }
}
