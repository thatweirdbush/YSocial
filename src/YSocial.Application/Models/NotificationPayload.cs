using YSocial.Domain.Notifications;

namespace YSocial.Application.Models;

public sealed record NotificationPayload(
    Guid Id,
    string Type,
    string Title,
    string Content,
    string? MetaData,
    Guid RecipientId)
{
    public static NotificationPayload FromDomain(Notification notification)
    {
        return new NotificationPayload(
            notification.Id.Value,
            notification.Type.Name,
            notification.Title,
            notification.Content,
            notification.MetaData,
            notification.RecipientId.Value
        );
    }
}
