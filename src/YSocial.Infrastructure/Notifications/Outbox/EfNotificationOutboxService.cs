using System.Text.Json;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Infrastructure.Persistence;

namespace YSocial.Infrastructure.Notifications.Outbox;

/// <summary>
/// Transactional outbox: the message is added to the request's <see cref="YSocialDbContext"/>, so it is saved (or not)
/// together with the business change that produced it.
/// </summary>
internal sealed class EfNotificationOutboxService(YSocialDbContext db) : INotificationOutboxService
{
    /// <inheritdoc/>
    public Task EnqueueAsync<T>(string messageType, T payload, CancellationToken cancellationToken = default)
    {
        var message = new NotificationOutboxMessage(Guid.NewGuid(), messageType, JsonSerializer.Serialize(payload));
        db.NotificationOutboxMessages.Add(message);

        return Task.CompletedTask;
    }
}
