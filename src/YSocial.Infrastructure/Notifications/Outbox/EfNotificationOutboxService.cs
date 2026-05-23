using System.Text.Json;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Infrastructure.Data;

namespace YSocial.Infrastructure.Notifications.Outbox;

internal sealed class EfNotificationOutboxService(MockNotificationOutboxStore outboxStore) : INotificationOutboxService
{
    /// <inheritdoc/>
    public Task EnqueueAsync<T>(string messageType, T payload, CancellationToken cancellationToken = default)
    {
        // Convert the Object Payload to a JSON string to store in the jsonb column
        var jsonContent = JsonSerializer.Serialize(payload);

        // Create a new Outbox Message
        var outboxMessage = new NotificationOutboxMessage(
            Guid.NewGuid(),
            messageType,
            jsonContent
        );

        // Lock for security when multi-threading
        lock (outboxStore.Messages)
        {
            outboxStore.Messages.Add(outboxMessage);
        }

        return Task.CompletedTask;
    }
}
