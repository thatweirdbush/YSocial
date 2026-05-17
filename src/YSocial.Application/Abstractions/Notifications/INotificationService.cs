using YSocial.Domain.Notifications;

namespace YSocial.Application.Abstractions.Notifications;

public interface INotificationService
{
    Task SendNotificationAsync(Notification notification, CancellationToken cancellationToken = default);
}
