using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.CQRS.Behaviors.Logging;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Features.Media;
using YSocial.Application.Features.Media.UploadMedia;
using YSocial.Application.Models;
using YSocial.Domain.Media;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.Infrastructure.Persistence.UnitOfWork;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Media;

/// <summary>
/// The write-ahead flow over a real SQLite database & the fake storage with fault injection. Every request gets its own
/// context (own change tracker, like production); the invariant checked everywhere: no remote file the database does not know.
/// </summary>
public sealed class UploadMediaHandlerTests : IDisposable
{
    private static readonly UserId Owner = SeedIds.TestUser;

    private readonly SqliteTestDatabase _database = new();
    private readonly FakeMediaStorage _storage = new();
    private readonly MediaOptions _options = new() { Environment = "test" };
    private readonly MediaUploadGate _gate;

    public UploadMediaHandlerTests() => _gate = new MediaUploadGate(_options);

    public void Dispose() => _database.Dispose();

    #region Harness
    // Holds the FIRST commit of a request until both racers reached it: both read the same count before either saves
    private sealed class SyncedUnitOfWork(IUnitOfWork inner, Barrier barrier) : IUnitOfWork
    {
        private int _synced;

        public async Task<int> CommitAsync(CancellationToken cancellationToken = default)
        {
            if (Interlocked.Exchange(ref _synced, 1) == 0) await Task.Run(() => barrier.SignalAndWait(TimeSpan.FromSeconds(10)), cancellationToken);

            return await inner.CommitAsync(cancellationToken);
        }
    }

    private UploadMediaCommandHandler NewHandler(UserId? user = null, MediaUploadGate? gate = null, bool authenticated = true, Barrier? barrier = null)
    {
        var db = _database.NewContext();
        var realUnitOfWork = new UnitOfWork(db, Substitute.For<IDomainEventsDispatcher>());
        IUnitOfWork unitOfWork = barrier is null ? realUnitOfWork : new SyncedUnitOfWork(realUnitOfWork, barrier);
        var userContext = Substitute.For<IUserContext>();
        userContext.IsAuthenticated.Returns(authenticated);
        userContext.UserId.Returns((user ?? Owner).Value);

        return new UploadMediaCommandHandler(
            new MediaAssetRepository(db, realUnitOfWork), unitOfWork, _storage, userContext, gate ?? _gate, _options, TimeProvider.System, NullLogger<UploadMediaCommandHandler>.Instance);
    }

    private static UploadFile Png(string name = "a.png") => new(name, 1000, () => new MemoryStream(MediaSamples.Png(800, 600, padding: 900)));

    private static UploadFile Mp4(string name = "v.mp4") => new(name, 5000, () => new MemoryStream(MediaSamples.Mp4(padding: 4900)));

    private static UploadMediaCommand Command(string? purpose = null, params UploadFile[] files) => new(purpose, files);

    private List<MediaAsset> Rows()
    {
        using var db = _database.NewContext();
        return db.MediaAssets.AsNoTracking().ToList();
    }

    private void AddRows(UserId owner, int count, bool pending = true)
    {
        using var db = _database.NewContext();

        for (var i = 0; i < count; i++)
        {
            var asset = MediaAsset.Create(owner, MediaKind.Image, MediaPurpose.Post, "test");
            if (pending) asset.MarkUploaded("https://res.cloudinary.com/demo/image/upload/x.jpg", null, 1, 1, null, 1);
            db.MediaAssets.Add(asset);
        }

        db.SaveChanges();
    }

    private void AssertNothingLeft()
    {
        Rows().Should().BeEmpty("a failed upload removes its rows");
        _storage.StoredIds.Should().BeEmpty("no remote file may outlive its row");
    }
    #endregion

    #region Success
    [Fact]
    public async Task Upload_ImagesAndVideo_RowsArePending_FilesStored_DtosMatch()
    {
        var result = await NewHandler().Handle(Command("post", Png("1.png"), Png("2.png"), Mp4()), default);

        result.IsSuccess.Should().BeTrue();
        var dtos = result.Value;
        dtos.Select(d => d.Kind).Should().Equal("image", "image", "video");
        dtos[2].PosterUrl.Should().NotBeNull();
        dtos[2].DurationSeconds.Should().Be(12.5);
        dtos[0].PosterUrl.Should().BeNull();

        var rows = Rows();
        rows.Should().OnlyContain(r => r.Status == MediaAssetStatus.Pending && r.OwnerId == Owner && r.Purpose == MediaPurpose.Post);
        rows.Select(r => r.Id.Value).Should().BeEquivalentTo(dtos.Select(d => d.Id));
        _storage.StoredIds.Should().BeEquivalentTo(rows.Select(r => r.PublicId));
        rows.Select(r => r.PublicId).Should().OnlyContain(id => id.StartsWith("ysocial/test/posts/"));
    }

    [Fact]
    public async Task Upload_Avatar_UsesAvatarFolderAndPurpose()
    {
        var result = await NewHandler().Handle(Command("Avatar", Png()), default);

        result.IsSuccess.Should().BeTrue();
        Rows().Single().Should().Match<MediaAsset>(r => r.Purpose == MediaPurpose.Avatar && r.PublicId.StartsWith("ysocial/test/avatars/"));
    }

    [Fact]
    public async Task Upload_NeverUsesTheFileNameInTheRemoteKey()
    {
        await NewHandler().Handle(Command("post", Png("../../etc/passwd.png")), default);

        _storage.StoredIds.Single().Should().NotContain("passwd").And.NotContain("..");
    }

    [Fact]
    public async Task Upload_Unauthenticated_IsUnauthorized_AndTouchesNothing()
    {
        var result = await NewHandler(authenticated: false).Handle(Command("post", Png()), default);

        result.ErrorType.Should().Be(ErrorType.Unauthorized);
        AssertNothingLeft();
        _storage.UploadAttempts.Should().Be(0);
    }
    #endregion

    #region Compensation
    [Fact]
    public async Task StorageDown_OnFirstFile_ThrowsAfterCleaningUp()
    {
        _storage.BeforeUpload = (_, _) => throw new MediaStorageUnavailableException("down");

        var act = () => NewHandler().Handle(Command("post", Png(), Png()), default);

        await act.Should().ThrowAsync<MediaStorageUnavailableException>();
        AssertNothingLeft();
    }

    [Fact]
    public async Task OneFileFailing_RemovesTheOthers_AllOrNothing()
    {
        _storage.BeforeUpload = (_, attempt) => attempt == 3 ? throw new MediaStorageUnavailableException("third failed") : Task.CompletedTask;

        var act = () => NewHandler().Handle(Command("post", Png(), Png(), Png(), Png()), default);

        await act.Should().ThrowAsync<MediaStorageUnavailableException>();
        _storage.UploadAttempts.Should().Be(3);
        AssertNothingLeft();
    }

    [Fact]
    public async Task ProviderRejection_Is400_NotAnException_AndClean()
    {
        _storage.BeforeUpload = (_, attempt) => attempt == 2 ? throw new MediaRejectedException("File size too large.") : Task.CompletedTask;

        var result = await NewHandler().Handle(Command("post", Png(), Png()), default);

        result.IsSuccess.Should().BeFalse();
        result.ErrorType.Should().Be(ErrorType.Validation);
        result.Error.Should().Contain("too large");
        AssertNothingLeft();
    }

    [Theory]
    [InlineData(5000, 100, 10.0)]
    [InlineData(100, 4097, 10.0)]
    [InlineData(1920, 1080, 600.5)]
    public async Task VideoBeyondLimits_IsRejectedAfterUpload_FileDeleted(int width, int height, double seconds)
    {
        _storage.Shape = _ => (width, height, seconds);

        var result = await NewHandler().Handle(Command("post", Mp4()), default);

        result.ErrorType.Should().Be(ErrorType.Validation);
        AssertNothingLeft();
        _storage.UploadAttempts.Should().Be(1);
    }

    [Fact]
    public async Task VideoAtTheLimits_IsAccepted()
    {
        _storage.Shape = _ => (4096, 4096, 600);

        (await NewHandler().Handle(Command("post", Mp4()), default)).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task AnswerLostAfterStoring_AndDeleteFailing_LeavesDeletingRowsForTheSweep()
    {
        _storage.AfterStore = (_, _) => throw new MediaStorageUnavailableException("answer lost");
        _storage.FailDeletes = true;

        var act = () => NewHandler().Handle(Command("post", Png(), Png()), default);

        await act.Should().ThrowAsync<MediaStorageUnavailableException>();

        // Rows were saved BEFORE the upload, so the leftover file is known and can be deleted by id later
        var rows = Rows();
        rows.Should().HaveCount(2).And.OnlyContain(r => r.Status == MediaAssetStatus.Deleting);
        _storage.StoredIds.Should().BeSubsetOf(rows.Select(r => r.PublicId));
        _storage.StoredIds.Should().NotBeEmpty();
    }

    [Fact]
    public async Task ClientAbort_CompensatesWithAFreshToken_AndRethrows()
    {
        using var cts = new CancellationTokenSource();
        _storage.BeforeUpload = async (_, attempt) =>
        {
            if (attempt != 2) return;
            await cts.CancelAsync();
            cts.Token.ThrowIfCancellationRequested();
        };

        var act = () => NewHandler().Handle(Command("post", Png(), Png()), cts.Token);

        await act.Should().ThrowAsync<OperationCanceledException>();
        AssertNothingLeft();
    }
    #endregion

    #region Quota
    [Fact]
    public async Task Cap_ReservedPlusRequestOver30_Is400_AndNothingIsInserted()
    {
        AddRows(Owner, 28);

        var result = await NewHandler().Handle(Command("post", Png(), Png(), Png()), default);

        result.ErrorType.Should().Be(ErrorType.Validation);
        Rows().Should().HaveCount(28);
        _storage.UploadAttempts.Should().Be(0);
    }

    [Fact]
    public async Task Cap_ExactlyThirty_IsAllowed()
    {
        AddRows(Owner, 28);

        (await NewHandler().Handle(Command("post", Png(), Png()), default)).IsSuccess.Should().BeTrue();
        Rows().Should().HaveCount(30);
    }

    [Fact]
    public async Task Cap_AttachedAndOtherUsersDoNotCount()
    {
        using (var db = _database.NewContext())
        {
            var attached = MediaAsset.Create(Owner, MediaKind.Image, MediaPurpose.Post, "t");
            attached.MarkUploaded("https://res.cloudinary.com/demo/image/upload/x.jpg", null, 1, 1, null, 1);
            attached.MarkAttached(Owner, MediaPurpose.Post);
            db.MediaAssets.Add(attached);
            db.SaveChanges();
        }

        AddRows(SeedIds.DemoUser, 30);
        AddRows(Owner, 28);

        (await NewHandler().Handle(Command("post", Png(), Png()), default)).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task ParallelReserves_NeverExceedTheCap_LoserGetsConflict()
    {
        AddRows(Owner, 25);

        // Two instances (own gates): both read 25 and both would fit 4 more, the quota token lets one win
        var barrier = new Barrier(2);
        var first = NewHandler(gate: new MediaUploadGate(_options), barrier: barrier);
        var second = NewHandler(gate: new MediaUploadGate(_options), barrier: barrier);

        var outcomes = await Task.WhenAll(Race(first), Race(second));

        outcomes.Count(o => o is Result<IReadOnlyList<MediaDto>> { IsSuccess: true }).Should().Be(1);
        outcomes.Count(o => o is ConcurrencyConflictException).Should().Be(1);
        Rows().Should().HaveCount(29);
    }

    private static async Task<object> Race(UploadMediaCommandHandler handler)
    {
        await Task.Yield();

        try
        {
            return await handler.Handle(Command("post", Png(), Png(), Png(), Png()), default);
        }
        catch (ConcurrencyConflictException exception)
        {
            return exception;
        }
    }
    #endregion

    #region Gates
    [Fact]
    public async Task SecondConcurrentUploadOfTheSameUser_IsTooMany_ThenAllowedAgain()
    {
        var hold = new TaskCompletionSource();
        var started = new TaskCompletionSource();
        _storage.BeforeUpload = async (_, _) =>
        {
            started.TrySetResult();
            await hold.Task;
        };

        var first = NewHandler().Handle(Command("post", Png()), default);
        await started.Task;

        var second = () => NewHandler().Handle(Command("post", Png()), default);
        await second.Should().ThrowAsync<TooManyUploadsException>();

        hold.SetResult();
        (await first).IsSuccess.Should().BeTrue();

        _storage.BeforeUpload = null;
        (await NewHandler().Handle(Command("post", Png()), default)).IsSuccess.Should().BeTrue();
    }

    [Fact]
    public async Task InstanceGate_CapsConcurrentUploadsAcrossUsers()
    {
        var narrow = new MediaUploadGate(new MediaOptions { MaxConcurrentUploads = 1 });
        var hold = new TaskCompletionSource();
        var started = new TaskCompletionSource();
        _storage.BeforeUpload = async (_, _) =>
        {
            started.TrySetResult();
            await hold.Task;
        };

        var first = NewHandler(gate: narrow).Handle(Command("post", Png()), default);
        await started.Task;

        var other = () => NewHandler(SeedIds.DemoUser, narrow).Handle(Command("post", Png()), default);
        await other.Should().ThrowAsync<TooManyUploadsException>();

        hold.SetResult();
        await first;
    }

    [Fact]
    public async Task Lease_IsReleasedWhenTheUploadFails()
    {
        _storage.BeforeUpload = (_, _) => throw new MediaStorageUnavailableException("down");
        await NewHandler().Invoking(h => h.Handle(Command("post", Png()), default)).Should().ThrowAsync<MediaStorageUnavailableException>();

        _storage.BeforeUpload = null;

        (await NewHandler().Handle(Command("post", Png()), default)).IsSuccess.Should().BeTrue();
    }
    #endregion

    #region Logging
    [Fact]
    public void LogRedactor_NeverOpensTheFileStream()
    {
        var opened = 0;
        var file = new UploadFile("a.png", 10, () =>
        {
            opened++;
            return new MemoryStream();
        });

        var text = LogRedactor.Describe(new UploadMediaCommand("post", [file]));

        opened.Should().Be(0);
        text.Should().Contain("a.png").And.Contain("OpenRead = ***");
    }
    #endregion
}
