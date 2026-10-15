namespace YSocial.Infrastructure.Notifications.Outbox;

public sealed class NotificationOutboxMessage
{
    public Guid Id { get; private set; }
    public string Type { get; private set; } = string.Empty;
    public string Content { get; private set; } = string.Empty; // Json serialized content of the notification
    public DateTime OccurredOnUtc { get; private set; }
    public DateTime? ProcessedOnUtc { get; private set; }
    public string? Error { get; private set; } // To retry later
    public int Attempts { get; private set; }

    // For EF Core
    private NotificationOutboxMessage() { }

    public NotificationOutboxMessage(Guid id, string type, string content)
    {
        Id = id;
        Type = type;
        Content = content;
        OccurredOnUtc = DateTime.UtcNow;
    }

    public void MarkAsProcessed()
    {
        ProcessedOnUtc = DateTime.UtcNow;
        Error = null;
    }

    public void MarkAsFailed(string errorMessage)
    {
        Error = errorMessage;
        Attempts++;
    }
}
