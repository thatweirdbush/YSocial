using Microsoft.AspNetCore.SignalR;
using YSocial.Application.Abstractions.Notifications;
using YSocial.Domain.Notifications;

namespace YSocial.Infrastructure.Notifications;

internal sealed class SignalRNotificationService(
    IHubContext<NotificationHub> hubContext) : INotificationService
{
    public async Task SendNotificationAsync(Notification notification, CancellationToken cancellationToken = default)
    {
        var notificationDto = new
        {
            Id = notification.Id.Value,
            Type = notification.Type.Name,
            Title = notification.Title,
            Content = notification.Content,
            MetaData = notification.MetaData,
            IsRead = notification.IsRead,
            CreatedAt = notification.CreatedAt
        };

        // Send specifically to the Recipient.
        // SignalR automatically groups all devices (Web, Mobile) that the User is currently logged into.
        await hubContext.Clients
            .User(notification.RecipientId.Value.ToString())
            .SendAsync("ReceiveNotification", notificationDto, cancellationToken);
    }
}
