using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using YSocial.Application.Models;
using YSocial.Infrastructure.Data;

namespace YSocial.Infrastructure.Notifications.Outbox;

/// <summary>
/// One outbox batch: pushes unprocessed messages through the hub, REMOVES the delivered ones from the store and keeps
/// failed ones for retry until <see cref="MaxAttempts"/> (then they are dropped and logged).
/// </summary>
public sealed class NotificationOutboxProcessor(
    MockNotificationOutboxStore outboxStore,
    IHubContext<NotificationHub> hubContext,
    ILogger<NotificationOutboxProcessor> logger)
{
    public const int BatchSize = 20;
    public const int MaxAttempts = 5;

    /// <returns>Number of messages delivered in this batch.</returns>
    public async Task<int> ProcessBatchAsync(CancellationToken cancellationToken = default)
    {
        List<NotificationOutboxMessage> batch;
        lock (outboxStore.Messages)
        {
            batch = outboxStore.Messages
                .Where(m => m.ProcessedOnUtc == null && m.Attempts < MaxAttempts)
                .OrderBy(m => m.OccurredOnUtc)
                .Take(BatchSize)
                .ToList();
        }

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

        // Delivered messages leave the store (the list must not grow forever); exhausted ones are dropped too
        lock (outboxStore.Messages)
        {
            outboxStore.Messages.RemoveAll(m => m.ProcessedOnUtc != null || m.Attempts >= MaxAttempts);
        }

        return delivered;
    }
}
