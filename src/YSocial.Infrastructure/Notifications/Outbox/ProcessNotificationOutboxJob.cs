using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace YSocial.Infrastructure.Notifications.Outbox;

/// <summary>
/// Background service that runs one <see cref="NotificationOutboxProcessor"/> batch per second.
/// </summary>
public sealed class ProcessNotificationOutboxJob(
    IServiceProvider serviceProvider,
    ILogger<ProcessNotificationOutboxJob> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("Notification outbox job started");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                using var scope = serviceProvider.CreateScope();
                await scope.ServiceProvider.GetRequiredService<NotificationOutboxProcessor>().ProcessBatchAsync(cancellationToken);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                logger.LogError(ex, "Critical error in Notification Outbox Job scanning cycle.");
            }

            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
        }
    }
}
