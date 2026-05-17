using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.Notifications;

public interface INotificationRepository : IRepository<Notification, NotificationId>
{
    Task<IReadOnlyList<Notification>> GetByRecipientIdAsync(UserId recipientId, int page, int pageSize, CancellationToken cancellationToken = default);
}
