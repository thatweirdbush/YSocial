namespace YSocial.Application.Abstractions.Notifications;

/// <summary>
/// Intermediate Service abstraction, that pushes messages into the Outbox.
/// <para>
/// It receives notification data from the Event Handler, converts into a JSON string,
/// and then writes to the Outbox table in the database.
/// </para>
/// </summary>
public interface INotificationOutboxService
{
    /// <summary>
    /// Enqueues a notification message into the Outbox.
    /// </summary>
    /// <typeparam name="T">The type of the notification payload.</typeparam>
    /// <param name="messageType">The type of the message.</param>
    /// <param name="payload">The notification payload.</param>
    /// <param name="cancellationToken">A cancellation token.</param>
    /// <returns>A task that represents the asynchronous operation of enqueuing the notification message.</returns>
    Task EnqueueAsync<T>(string messageType, T payload, CancellationToken cancellationToken = default);
}
