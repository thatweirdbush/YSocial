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
    /// Entity the FE navigates to: post or comment id (like, comment), follower id (follow types)
    /// </summary>
    public Guid? TargetId { get; private set; }
    public bool IsRead { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? ReadAt { get; private set; }

#pragma warning disable CS8618
    private Notification() { }
#pragma warning restore CS8618

    private Notification(
        UserId recipientId,
        UserId senderId,
        NotificationType type,
        string title,
        string content,
        Guid? targetId)
    {
        Id = NotificationId.New();
        RecipientId = recipientId;
        SenderId = senderId;
        Type = type;
        Title = title;
        Content = content;
        TargetId = targetId;
        IsRead = false;
        CreatedAt = DateTime.UtcNow;
    }

    public static Notification Create(
        UserId recipientId,
        UserId senderId,
        NotificationType type,
        string title,
        string content,
        Guid? targetId = null)
    {
        CheckRule(new CannotSendNotificationToYourselfRule(senderId, recipientId));
        CheckRule(new NotificationContentMustNotBeEmptyRule(title, content));

        return new Notification(
            recipientId,
            senderId,
            type,
            title,
            content,
            targetId);
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