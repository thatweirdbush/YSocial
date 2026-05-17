using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Notifications.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Notifications;

public sealed class Notification : AggregateRoot<NotificationId>
{
    public UserId RecipientId { get; private set; }
    public UserId SenderId { get; private set; }
    public NotificationType Type { get; private set; }
    public string Title { get; private set; }
    public string Content { get; private set; }

    /// <summary>
    ///  Dynamic metadata as JSON (e.g., PostId, CommentId for FE to click on for navigation)
    /// </summary>
    public string? MetaData { get; private set; }
    public bool IsRead { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? ReadAt { get; private set; }

    private Notification(
        UserId recipientId,
        UserId senderId,
        NotificationType type,
        string title,
        string content,
        string? metaData)
    {
        Id = NotificationId.New();
        RecipientId = recipientId;
        SenderId = senderId;
        Type = type;
        Title = title;
        Content = content;
        MetaData = metaData;
        IsRead = false;
        CreatedAt = DateTime.UtcNow;
    }

    public static Notification Create(
        UserId recipientId,
        UserId senderId,
        NotificationType type,
        string title,
        string content,
        string? metaData = null)
    {
        CheckRule(new CannotSendNotificationToYourselfRule(senderId, recipientId));
        CheckRule(new NotificationContentMustNotBeEmptyRule(title, content));

        return new Notification(
            recipientId,
            senderId,
            type,
            title,
            content,
            metaData);
    }

    public void MarkAsRead(UserId currentUserId)
    {
        CheckRule(new OnlyRecipientCanReadNotificationRule(currentUserId, RecipientId));

        if (!IsRead)
        {
            IsRead = true;
            ReadAt = DateTime.UtcNow;
        }
    }
}