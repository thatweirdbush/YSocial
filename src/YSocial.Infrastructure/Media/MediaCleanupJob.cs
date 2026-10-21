using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Media;

namespace YSocial.Infrastructure.Media;

/// <summary>
/// Background service that runs one <see cref="MediaCleanupProcessor"/> sweep every <see cref="MediaOptions.SweepIntervalMinutes"/>.
/// </summary>
public sealed class MediaCleanupJob(MediaCleanupProcessor processor, MediaOptions options, ILogger<MediaCleanupJob> logger) : BackgroundService
{
    private static readonly TimeSpan StartupDelay = TimeSpan.FromSeconds(30);

    protected override async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Media cleanup job started (every {Minutes} min)", options.SweepIntervalMinutes);

        try
        {
            await Task.Delay(StartupDelay, cancellationToken);

            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    var report = await processor.RunAsync(cancellationToken);

                    if (report.Claimed > 0)
                    {
                        logger.LogInformation("Media sweep: {Deleted} deleted, {Failed} failed, {Skipped} skipped", report.Deleted, report.Failed, report.Skipped);
                    }
                }
                catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
                {
                    logger.LogError(exception, "Media sweep failed; the next run retries");
                }

                await Task.Delay(TimeSpan.FromMinutes(options.SweepIntervalMinutes), cancellationToken);
            }
        }
        catch (OperationCanceledException)
        {
            // Host shutdown
        }
    }
}
