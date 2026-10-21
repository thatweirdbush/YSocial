using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Media.DiscardMedia;
using YSocial.Domain.Media;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Media;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.Infrastructure.Persistence.UnitOfWork;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Media;

public sealed class DiscardMediaHandlerTests : IDisposable
{
    private static readonly UserId Owner = SeedIds.TestUser;

    private readonly SqliteTestDatabase _database = new();
    private readonly FakeMediaStorage _storage = new();

    public void Dispose() => _database.Dispose();

    // Runs a hook right before the first commit: another request gets in between "loaded" and "saved"
    private sealed class HookedUnitOfWork(IUnitOfWork inner, Func<Task> beforeFirstCommit) : IUnitOfWork
    {
        private int _hooked;

        public async Task<int> CommitAsync(CancellationToken cancellationToken = default)
        {
            if (Interlocked.Exchange(ref _hooked, 1) == 0) await beforeFirstCommit();

            return await inner.CommitAsync(cancellationToken);
        }
    }

    private DiscardMediaCommandHandler NewHandler(IMediaStorage? storage = null, Func<Task>? beforeFirstCommit = null)
    {
        var db = _database.NewContext();
        var realUnitOfWork = new UnitOfWork(db, Substitute.For<IDomainEventsDispatcher>());
        IUnitOfWork unitOfWork = beforeFirstCommit is null ? realUnitOfWork : new HookedUnitOfWork(realUnitOfWork, beforeFirstCommit);
        var userContext = Substitute.For<IUserContext>();
        userContext.IsAuthenticated.Returns(true);
        userContext.UserId.Returns(Owner.Value);

        return new DiscardMediaCommandHandler(
            new MediaAssetRepository(db, realUnitOfWork), unitOfWork, storage ?? _storage, userContext, TimeProvider.System, NullLogger<DiscardMediaCommandHandler>.Instance);
    }

    private async Task<MediaAsset> PendingAsync()
    {
        var asset = MediaAsset.Create(Owner, MediaKind.Image, MediaPurpose.Post, "test");
        asset.MarkUploaded("https://res.cloudinary.com/demo/image/upload/x.jpg", null, 1, 1, null, 1);

        using (var db = _database.NewContext())
        {
            db.MediaAssets.Add(asset);
            await db.SaveChangesAsync();
        }

        await _storage.UploadAsync(new MediaUpload(asset.Id, asset.PublicId, MediaKind.Image, MediaPurpose.Post, "image/png", new MemoryStream([1])), default);
        return asset;
    }

    private MediaAsset Row(MediaAsset asset)
    {
        using var db = _database.NewContext();
        return db.MediaAssets.AsNoTracking().Single(a => a.Id == asset.Id);
    }

    [Fact]
    public async Task AttachWinsTheRace_DiscardAnswersNotFound_AssetStaysAttached_FileStays()
    {
        var asset = await PendingAsync();

        var handler = NewHandler(beforeFirstCommit: () =>
        {
            using var db = _database.NewContext();
            db.MediaAssets.Single(a => a.Id == asset.Id).MarkAttached(Owner, MediaPurpose.Post);
            db.SaveChanges();
            return Task.CompletedTask;
        });

        var result = await handler.Handle(new DiscardMediaCommand(asset.Id.Value), default);

        result.ErrorType.Should().Be(ErrorType.NotFound);
        Row(asset).Status.Should().Be(MediaAssetStatus.Attached);
        _storage.StoredIds.Should().Equal(asset.PublicId);
        _storage.DeleteRequests.Should().BeEmpty();
    }

    [Fact]
    public async Task SweepClaimsFirst_DiscardAnswersNotFound_AndDeletesNothingItself()
    {
        var asset = await PendingAsync();

        var handler = NewHandler(beforeFirstCommit: () =>
        {
            using var db = _database.NewContext();
            db.MediaAssets.Single(a => a.Id == asset.Id).Claim(DateTime.UtcNow);
            db.SaveChanges();
            return Task.CompletedTask;
        });

        var result = await handler.Handle(new DiscardMediaCommand(asset.Id.Value), default);

        result.ErrorType.Should().Be(ErrorType.NotFound);
        _storage.DeleteRequests.Should().BeEmpty("the sweeper that won the claim owns the deletion");
    }

    [Fact]
    public async Task UnavailableStorage_Throws503_BeforeTouchingTheRow()
    {
        var asset = await PendingAsync();

        var act = () => NewHandler(new UnavailableMediaStorage()).Handle(new DiscardMediaCommand(asset.Id.Value), default);

        await act.Should().ThrowAsync<MediaStorageUnavailableException>();
        Row(asset).Status.Should().Be(MediaAssetStatus.Pending);
    }

    [Fact]
    public async Task ClaimIsDurable_EvenWhenTheRemoteDeleteThrows()
    {
        var asset = await PendingAsync();
        _storage.FailDeletes = true;

        var result = await NewHandler().Handle(new DiscardMediaCommand(asset.Id.Value), default);

        result.IsSuccess.Should().BeTrue();
        Row(asset).Status.Should().Be(MediaAssetStatus.Deleting);
    }
}
