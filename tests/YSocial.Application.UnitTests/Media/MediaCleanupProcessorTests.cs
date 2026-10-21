using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Logging;
using Xunit;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;
using YSocial.Domain.Users;
using YSocial.Infrastructure;
using YSocial.Infrastructure.Media;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Media;

/// <summary>
/// The sweep end to end over the production composition (repos, unit of work, scopes) on SQLite with the fake storage and a manual clock.
/// Invariant everywhere: afterwards no row is Deleting-forever and no remote file lacks a row.
/// </summary>
public sealed class MediaCleanupProcessorTests : IDisposable
{
    private static readonly UserId Owner = SeedIds.TestUser;

    private readonly SqliteTestDatabase _database = new();
    private readonly FakeMediaStorage _storage = new();
    private readonly ManualTimeProvider _clock = new();
    private readonly MediaOptions _options = new() { Environment = "test" };
    private readonly ServiceProvider _provider;
    private readonly TestLogs _logs = new();

    public MediaCleanupProcessorTests()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["ConnectionStrings:DefaultConnection"] = "Host=localhost;Database=x"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging(logging => logging.AddProvider(_logs));
        services.AddHttpContextAccessor();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddSingleton(_options);
        services.AddApplication();
        services.AddInfrastructure(configuration);
        _database.ReplaceDatabaseOf(services);
        services.RemoveAll<IMediaStorage>();
        services.AddSingleton<IMediaStorage>(_storage);
        services.RemoveAll<TimeProvider>();
        services.AddSingleton<TimeProvider>(_clock);

        _provider = services.BuildServiceProvider();
    }

    public void Dispose()
    {
        _provider.Dispose();
        _database.Dispose();
    }

    #region Harness
    // A new instance per call (the singleton of production would share the test seam between two "instances")
    private MediaCleanupProcessor Processor() => ActivatorUtilities.CreateInstance<MediaCleanupProcessor>(_provider);

    private sealed class TestLogs : ILoggerProvider
    {
        public List<(LogLevel Level, string Message)> Entries { get; } = [];

        public ILogger CreateLogger(string categoryName) => new Capture(this);

        public void Dispose()
        {
        }

        private sealed class Capture(TestLogs owner) : ILogger
        {
            public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;

            public bool IsEnabled(LogLevel logLevel) => true;

            public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter)
            {
                lock (owner.Entries) owner.Entries.Add((logLevel, formatter(state, exception)));
            }
        }
    }

    /// <summary>
    /// Saves a row in the given status AND (like the real flow) the remote file under its key.
    /// </summary>
    private async Task<MediaAsset> ArrangeAsync(string status, UserId? owner = null, bool withFile = true)
    {
        var asset = MediaAsset.Create(owner ?? Owner, MediaKind.Image, MediaPurpose.Post, "test");

        if (status != "Uploading")
        {
            asset.MarkUploaded($"https://res.cloudinary.com/demo/image/upload/v1/{asset.PublicId}.jpg", null, 100, 100, null, 10);
        }

        switch (status)
        {
            case "Attached": asset.MarkAttached(owner ?? Owner, MediaPurpose.Post); break;
            case "Released": asset.MarkAttached(owner ?? Owner, MediaPurpose.Post); asset.Release(); break;
            case "Deleting": asset.Claim(_clock.GetUtcNow().UtcDateTime); break;
        }

        using (var db = _database.NewContext())
        {
            db.MediaAssets.Add(asset);
            await db.SaveChangesAsync();
        }

        if (withFile)
        {
            await _storage.UploadAsync(new MediaUpload(asset.Id, asset.PublicId, MediaKind.Image, MediaPurpose.Post, "image/png", new MemoryStream([1, 2, 3])), default);
        }

        return asset;
    }

    private List<MediaAsset> Rows()
    {
        using var db = _database.NewContext();
        return db.MediaAssets.AsNoTracking().ToList();
    }

    private MediaAsset Row(MediaAsset asset) => Rows().Single(r => r.Id == asset.Id);

    private void AssertClean()
    {
        Rows().Should().BeEmpty();
        _storage.StoredIds.Should().BeEmpty();
    }

    private void AdvanceMinutes(int minutes) => _clock.Advance(TimeSpan.FromMinutes(minutes));
    #endregion

    #region Windows
    [Fact]
    public async Task Uploading_OlderThan30Minutes_IsSwept_YoungerStays()
    {
        var asset = await ArrangeAsync("Uploading");

        AdvanceMinutes(29);
        (await Processor().RunAsync(default)).Deleted.Should().Be(0);
        Row(asset).Status.Should().Be(MediaAssetStatus.Uploading);

        AdvanceMinutes(2);
        var report = await Processor().RunAsync(default);

        report.Deleted.Should().Be(1);
        AssertClean();
    }

    [Fact]
    public async Task Pending_OlderThanTtl_IsSwept_YoungerStays()
    {
        var asset = await ArrangeAsync("Pending");

        _clock.Advance(TimeSpan.FromHours(23));
        await Processor().RunAsync(default);
        Row(asset).Status.Should().Be(MediaAssetStatus.Pending);

        _clock.Advance(TimeSpan.FromHours(2));
        await Processor().RunAsync(default);

        AssertClean();
    }

    [Fact]
    public async Task Released_PastTheGrace_IsSwept_WithinGraceStays()
    {
        var asset = await ArrangeAsync("Released");

        AdvanceMinutes(59);
        await Processor().RunAsync(default);
        Row(asset).Status.Should().Be(MediaAssetStatus.Released);
        _storage.StoredIds.Should().NotBeEmpty("cached UIs keep working during the grace period");

        AdvanceMinutes(2);
        await Processor().RunAsync(default);

        AssertClean();
    }

    [Fact]
    public async Task Attached_IsNeverSwept()
    {
        var asset = await ArrangeAsync("Attached");

        _clock.Advance(TimeSpan.FromDays(400));
        var report = await Processor().RunAsync(default);

        report.Claimed.Should().Be(0);
        Row(asset).Status.Should().Be(MediaAssetStatus.Attached);
        _storage.StoredIds.Should().Equal(asset.PublicId);
    }

    [Fact]
    public async Task Deleting_ExpiredLease_IsRetried_FreshLeaseIsLeftAlone()
    {
        var asset = await ArrangeAsync("Deleting");

        AdvanceMinutes(9);
        (await Processor().RunAsync(default)).Claimed.Should().Be(0);
        Row(asset).Status.Should().Be(MediaAssetStatus.Deleting);

        AdvanceMinutes(2);
        await Processor().RunAsync(default);

        AssertClean();
    }
    #endregion

    #region Remote behavior
    [Fact]
    public async Task AlreadyMissingRemoteFile_CountsAsDeleted()
    {
        await ArrangeAsync("Pending", withFile: false);

        _clock.Advance(TimeSpan.FromHours(25));
        var report = await Processor().RunAsync(default);

        report.Deleted.Should().Be(1);
        Rows().Should().BeEmpty();
    }

    [Fact]
    public async Task DeleteFailure_KeepsTheRowDeleting_CountsAttempts_AndRetriesAfterTheLease()
    {
        var asset = await ArrangeAsync("Pending");
        _clock.Advance(TimeSpan.FromHours(25));
        _storage.FailDeletes = true;

        var first = await Processor().RunAsync(default);

        first.Failed.Should().Be(1);
        var row = Row(asset);
        (row.Status, row.CleanupAttempts).Should().Be((MediaAssetStatus.Deleting, 1));
        _storage.StoredIds.Should().Equal(asset.PublicId);

        // Within the lease nothing is retried
        (await Processor().RunAsync(default)).Claimed.Should().Be(0);

        AdvanceMinutes(11);
        _storage.FailDeletes = false;
        var retry = await Processor().RunAsync(default);

        retry.Deleted.Should().Be(1);
        AssertClean();
    }

    [Fact]
    public async Task RepeatedFailures_AreCounted_AndLoggedAsErrorFromTheTenthAttempt_NeverDropped()
    {
        var asset = await ArrangeAsync("Pending");
        _clock.Advance(TimeSpan.FromHours(25));
        _storage.FailDeletes = true;

        for (var attempt = 1; attempt <= 10; attempt++)
        {
            await Processor().RunAsync(default);
            AdvanceMinutes(11);
        }

        Row(asset).CleanupAttempts.Should().Be(10);
        _logs.Entries.Should().Contain(e => e.Level == LogLevel.Error && e.Message.Contains(asset.Id.Value.ToString("N")));
        _storage.StoredIds.Should().Equal([asset.PublicId], "a failing row is never silently dropped");
    }

    [Fact]
    public async Task OneBatchDelete_ForAllClaimedRows()
    {
        for (var i = 0; i < 5; i++) await ArrangeAsync("Pending");
        _clock.Advance(TimeSpan.FromHours(25));

        var report = await Processor().RunAsync(default);

        report.Should().Be(new MediaCleanupReport(Claimed: 5, Deleted: 5, Failed: 0, Skipped: 0));
        _storage.DeleteRequests.Should().HaveCount(5);
        AssertClean();
    }

    [Fact]
    public async Task BatchIsBounded_RestWaitsForTheNextRun()
    {
        _options.SweepBatchSize = 3;
        for (var i = 0; i < 5; i++) await ArrangeAsync("Pending");
        _clock.Advance(TimeSpan.FromHours(25));

        (await Processor().RunAsync(default)).Deleted.Should().Be(3);
        (await Processor().RunAsync(default)).Deleted.Should().Be(2);

        AssertClean();
    }
    #endregion

    #region Races
    [Fact]
    public async Task AttachWinsTheRace_SweepSkipsTheRow_FileStays()
    {
        var asset = await ArrangeAsync("Pending");
        _clock.Advance(TimeSpan.FromHours(25));

        var processor = Processor();
        processor.BeforeClaimCommit = _ =>
        {
            // Another request attaches the asset after the sweep loaded it, before the sweep saved its claim
            using var db = _database.NewContext();
            var other = db.MediaAssets.Single(a => a.Id == asset.Id);
            other.MarkAttached(Owner, MediaPurpose.Post);
            db.SaveChanges();
            return Task.CompletedTask;
        };

        var report = await processor.RunAsync(default);

        report.Should().Be(new MediaCleanupReport(Claimed: 0, Deleted: 0, Failed: 0, Skipped: 1));
        Row(asset).Status.Should().Be(MediaAssetStatus.Attached);
        _storage.StoredIds.Should().Equal(asset.PublicId);
        _storage.DeleteRequests.Should().BeEmpty();
    }

    [Fact]
    public async Task TwoSweepersClaimingTheSameRow_OnlyOneDeletes()
    {
        var asset = await ArrangeAsync("Pending");
        _clock.Advance(TimeSpan.FromHours(25));

        var barrier = new Barrier(2);
        var first = Processor();
        var second = Processor();
        first.BeforeClaimCommit = _ => Task.Run(() => barrier.SignalAndWait(TimeSpan.FromSeconds(10)));
        second.BeforeClaimCommit = _ => Task.Run(() => barrier.SignalAndWait(TimeSpan.FromSeconds(10)));

        var reports = await Task.WhenAll(first.RunAsync(default), second.RunAsync(default));

        reports.Sum(r => r.Claimed).Should().Be(1);
        reports.Sum(r => r.Skipped).Should().Be(1);
        _storage.DeleteRequests.Should().HaveCount(1);
        AssertClean();
    }
    #endregion

    #region Crash scenarios of the upload flow
    [Fact]
    public async Task CrashAfterTx1_RowOnly_NoFile_EndsClean()
        => await RunCrashScenarioAsync(await ArrangeAsync("Uploading", withFile: false), minutes: 31);

    [Fact]
    public async Task CrashAfterUpload_BeforeTx2_FileOnUploadingRow_EndsClean()
        => await RunCrashScenarioAsync(await ArrangeAsync("Uploading"), minutes: 31);

    [Fact]
    public async Task CrashAfterTx2_PendingNeverUsed_EndsClean()
        => await RunCrashScenarioAsync(await ArrangeAsync("Pending"), minutes: 24 * 60 + 1);

    [Fact]
    public async Task CompensationInterrupted_DeletingRowWithFile_EndsClean()
        => await RunCrashScenarioAsync(await ArrangeAsync("Deleting"), minutes: 11);

    private async Task RunCrashScenarioAsync(MediaAsset leftover, int minutes)
    {
        leftover.Should().NotBeNull();
        AdvanceMinutes(minutes);

        await Processor().RunAsync(default);

        AssertClean();
    }
    #endregion

    #region Unavailable storage
    [Fact]
    public async Task UnavailableStorage_SkipsTheRun_WithOneWarning_AndTouchesNothing()
    {
        var asset = await ArrangeAsync("Pending", withFile: false);
        _clock.Advance(TimeSpan.FromHours(25));

        using var unavailable = new ServiceCollection()
            .AddLogging(l => l.AddProvider(_logs))
            .AddSingleton<IMediaStorage, UnavailableMediaStorage>()
            .BuildServiceProvider();
        var processor = new MediaCleanupProcessor(
            _provider.GetRequiredService<IServiceScopeFactory>(), unavailable.GetRequiredService<IMediaStorage>(), _options, _clock,
            unavailable.GetRequiredService<ILogger<MediaCleanupProcessor>>());

        var report = await processor.RunAsync(default);

        report.Should().Be(new MediaCleanupReport(0, 0, 0, 0));
        Row(asset).Status.Should().Be(MediaAssetStatus.Pending);
        _logs.Entries.Count(e => e.Level == LogLevel.Warning && e.Message.Contains("not configured")).Should().Be(1);
    }
    #endregion
}
