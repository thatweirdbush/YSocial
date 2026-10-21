using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Media;

namespace YSocial.Infrastructure.Media;

public sealed record MediaCleanupReport(int Claimed, int Deleted, int Failed, int Skipped);

/// <summary>
/// One sweep run: deletes abandoned and released media (rows are the source of truth, so nothing remote can be forgotten).
/// <list type="number">
/// <item>every candidate is CLAIMED (-> Deleting) under the <c>Version</c> token in its own scope: a row someone attached or another
/// instance claimed first is skipped,</item>
/// <item>the claimed files are deleted in ONE provider call (missing = success),</item>
/// <item>only AFTER a confirmed delete is the row removed; a provider failure keeps it Deleting (<c>CleanupAttempts++</c>, retried after the lease,
/// logged as error from the 10th attempt, never dropped).</item>
/// </list>
/// </summary>
public sealed class MediaCleanupProcessor(
    IServiceScopeFactory scopes,
    IMediaStorage storage,
    MediaOptions options,
    TimeProvider time,
    ILogger<MediaCleanupProcessor> logger)
{
    public const int ErrorAttempts = 10;

    /// <summary>
    /// Test seam: runs after a row was claimed in memory, before the claim is saved (to interleave other writers).
    /// </summary>
    internal Func<MediaAssetId, Task>? BeforeClaimCommit { get; set; }

    public async Task<MediaCleanupReport> RunAsync(CancellationToken cancellationToken)
    {
        if (!storage.IsAvailable)
        {
            logger.LogWarning("Media sweep skipped: media storage is not configured.");
            return new MediaCleanupReport(0, 0, 0, 0);
        }

        var now = time.GetUtcNow().UtcDateTime;
        var window = new MediaSweepWindow(
            UploadingBefore: now.AddMinutes(-options.UploadingLeaseMinutes),
            PendingBefore: now.AddHours(-options.PendingTtlHours),
            ReleasedBefore: now.AddMinutes(-options.ReleasedGraceMinutes),
            DeletingBefore: now.AddMinutes(-options.DeletingLeaseMinutes));

        var candidates = await LoadCandidatesAsync(window, cancellationToken);

        var claimed = new List<(MediaAssetId Id, StoredMediaRef Ref)>();
        var skipped = 0;

        foreach (var id in candidates)
        {
            var reference = await TryClaimAsync(id, window, now, cancellationToken);
            if (reference is null) skipped++;
            else claimed.Add((id, reference));
        }

        if (claimed.Count == 0)
        {
            return new MediaCleanupReport(0, 0, 0, skipped);
        }

        var confirmed = await TryDeleteRemoteAsync(claimed.Select(c => c.Ref).ToList(), cancellationToken);

        int deleted = 0, failed = 0;
        foreach (var (id, _) in claimed)
        {
            if (await FinishAsync(id, confirmed, now, cancellationToken)) deleted++;
            else failed++;
        }

        return new MediaCleanupReport(claimed.Count, deleted, failed, skipped);
    }

    private async Task<IReadOnlyList<MediaAssetId>> LoadCandidatesAsync(MediaSweepWindow window, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var batch = await scope.ServiceProvider.GetRequiredService<IMediaAssetRepository>()
            .GetSweepBatchAsync(window, options.SweepBatchSize, cancellationToken);

        return batch.Select(a => a.Id).ToList();
    }

    // Fresh load + re-check, then the token-checked claim: attach/discard/another sweeper racing us wins or loses in the database
    private async Task<StoredMediaRef?> TryClaimAsync(MediaAssetId id, MediaSweepWindow window, DateTime now, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IMediaAssetRepository>();

        var row = (await repository.GetByIdsAsync([id], cancellationToken)).FirstOrDefault();
        if (row is null || !row.IsSweepable(window)) return null;

        var reference = new StoredMediaRef(row.PublicId, row.Kind);

        try
        {
            row.Claim(now);

            if (BeforeClaimCommit is { } hook) await hook(id);

            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().CommitAsync(cancellationToken);
            return reference;
        }
        catch (ConcurrencyConflictException)
        {
            return null;
        }
    }

    private async Task<bool> TryDeleteRemoteAsync(IReadOnlyCollection<StoredMediaRef> refs, CancellationToken cancellationToken)
    {
        try
        {
            await storage.DeleteAsync(refs, cancellationToken);
            return true;
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            logger.LogWarning("Media sweep: provider delete failed for {Count} files ({ExceptionType}); retried after the lease", refs.Count, exception.GetType().Name);
            return false;
        }
    }

    private async Task<bool> FinishAsync(MediaAssetId id, bool remoteDeleted, DateTime now, CancellationToken cancellationToken)
    {
        using var scope = scopes.CreateScope();
        var repository = scope.ServiceProvider.GetRequiredService<IMediaAssetRepository>();

        var row = (await repository.GetByIdsAsync([id], cancellationToken)).FirstOrDefault();
        if (row is null) return remoteDeleted;

        try
        {
            if (remoteDeleted)
            {
                repository.Remove(row);
            }
            else
            {
                row.RecordCleanupFailure(now);

                if (row.CleanupAttempts >= ErrorAttempts)
                {
                    logger.LogError("Media asset {AssetId} could not be deleted remotely after {Attempts} attempts; it stays Deleting", id.Value.ToString("N"), row.CleanupAttempts);
                }
            }

            await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().CommitAsync(cancellationToken);
        }
        catch (ConcurrencyConflictException)
        {
            // Someone else finished or re-claimed it meanwhile: nothing more to do for this row
        }

        return remoteDeleted;
    }
}
