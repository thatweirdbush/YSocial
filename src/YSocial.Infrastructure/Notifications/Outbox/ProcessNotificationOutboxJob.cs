using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using System.Text.Json;
using YSocial.Application.Models;
using YSocial.Infrastructure.Data;

namespace YSocial.Infrastructure.Notifications.Outbox;

/// <summary>
/// The BackgroundService runs continuously to scan the Outbox table in the database,
/// retrieve unprocessed messages, parse JSON content, and send it in real-time via SignalR Hub.
/// </summary>
public sealed class ProcessNotificationOutboxJob(
    IServiceProvider serviceProvider,
    ILogger<ProcessNotificationOutboxJob> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken cancellationToken)
    {
        logger.LogInformation("==================================================");
        logger.LogInformation("--> NOTIFICATION OUTBOX JOB STARTED!");
        logger.LogInformation("==================================================");

        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                using var scope = serviceProvider.CreateScope();
                var outboxStore = scope.ServiceProvider.GetRequiredService<MockNotificationOutboxStore>();
                var hubContext = scope.ServiceProvider.GetRequiredService<IHubContext<NotificationHub>>();

                List<NotificationOutboxMessage> messages;

                lock (outboxStore.Messages)
                {
                    // 1. Scan for the Top 20 unprocessed messages
                    messages = outboxStore.Messages 
                        .Where(m => m.ProcessedOnUtc == null)
                        .OrderBy(m => m.OccurredOnUtc)
                        .Take(20)
                        .ToList();
                }

                //using var scope = serviceProvider.CreateScope();
                //var dbContext = scope.ServiceProvider.GetRequiredService<MockDataStore>();

                //// 1. Scan for the Top 20 unprocessed messages
                //var messages = await dbContext.Set<NotificationOutboxMessage>()
                //    .Where(m => m.ProcessedOnUtc == null)
                //    .OrderBy(m => m.OccurredOnUtc)
                //    .Take(20)
                //    .ToListAsync(cancellationToken);

                if (messages.Count > 0)
                {
                    foreach (var message in messages)
                    {
                        try
                        {
                            // 2. Parse JSON string from the Content column into payload object
                            var payload = JsonSerializer.Deserialize<NotificationPayload>(message.Content);
                            if (payload is null)
                                continue;

                            var recipientId = payload.RecipientId.ToString();

                            // 3. Send Real-time notification via SignalR Hub
                            // Send the raw JSON string to save CPU resources instead of serializing it again
                            await hubContext.Clients
                                .User(recipientId)
                                .SendAsync("ReceiveNotification", message.Content, cancellationToken);

                            // 4. Mark as processed
                            message.MarkAsProcessed();
                        }
                        catch (Exception ex)
                        {
                            logger.LogError(ex, "Error processing outbox message {MessageId}", message.Id);
                            message.MarkAsFailed(ex.Message);
                        }
                    }

                    //// 5. Update the Processed status to database after finishing the Batch
                    //await dbContext.SaveChangesAsync(cancellationToken);
                }
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Critical error in Notification Outbox Job scanning cycle.");
            }

            // Wait 1 second before the next scan (Optimization to avoid DB congestion)
            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
        }
    }
}