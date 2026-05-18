using System.Text.Json;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Infrastructure.Data;

namespace YSocial.Infrastructure.Notifications.Outbox;

internal sealed class EfNotificationOutboxService(MockDataStore dbContext) : INotificationOutboxService
{
    /// <inheritdoc/>
    public async Task EnqueueAsync<T>(string messageType, T payload, CancellationToken cancellationToken = default)
    {
        // Convert the Object Payload to a JSON string to store in the jsonb column
        var jsonContent = JsonSerializer.Serialize(payload);

        // Create a new Outbox Message
        var outboxMessage = new NotificationOutboxMessage(
            Guid.NewGuid(),
            messageType,
            jsonContent
        );

        // Insert into DbContext
        // At this point, the INSERT statement is still in RAM and hasn't been sent to the database yet
        await dbContext.Set<NotificationOutboxMessage>().AddAsync(outboxMessage, cancellationToken);
    }
}
