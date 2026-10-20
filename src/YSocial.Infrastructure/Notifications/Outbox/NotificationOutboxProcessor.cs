using System.Text.Json;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using YSocial.Application.Models;
using YSocial.Infrastructure.Persistence;

namespace YSocial.Infrastructure.Notifications.Outbox;

/// <summary>
/// One outbox batch: pushes unprocessed messages through the hub, DELETES the delivered ones and keeps failed ones for
/// retry until <see cref="MaxAttempts"/> (then they are deleted & logged).
/// </summary>
/// <remarks>
/// Single-instance: 2 instances polling the same table could push a message twice.
/// </remarks>
public sealed class NotificationOutboxProcessor(
    YSocialDbContext db,
    IHubContext<NotificationHub> hubContext,
    ILogger<NotificationOutboxProcessor> logger)
{
    public const int BatchSize = 20;
    public const int MaxAttempts = 5;

    /// <returns>Number of messages delivered in this batch.</returns>
    public async Task<int> ProcessBatchAsync(CancellationToken cancellationToken = default)
    {
        var batch = await db.NotificationOutboxMessages
            .Where(m => m.ProcessedOnUtc == null && m.Attempts < MaxAttempts)
            .OrderBy(m => m.OccurredOnUtc)
            .Take(BatchSize)
            .ToListAsync(cancellationToken);

        var delivered = 0;
        foreach (var message in batch)
        {
            try
            {
                var envelope = JsonSerializer.Deserialize<NotificationEnvelope>(message.Content)
                               ?? throw new InvalidOperationException("Outbox message has no content.");

                await hubContext.Clients
                    .User(envelope.RecipientId.ToString())
                    .SendAsync("ReceiveNotification", envelope.Payload, cancellationToken);

                message.MarkAsProcessed();
                delivered++;
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                logger.LogError(ex, "Error processing outbox message {MessageId} (attempt {Attempt})", message.Id, message.Attempts + 1);
                message.MarkAsFailed(ex.Message);
            }
        }

        // Delivered messages leave the table (it must not grow forever); exhausted ones are dropped too
        db.NotificationOutboxMessages.RemoveRange(batch.Where(m => m.ProcessedOnUtc != null || m.Attempts >= MaxAttempts));
        await db.SaveChangesAsync(cancellationToken);

        return delivered;
    }
}
