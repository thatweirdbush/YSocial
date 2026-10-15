using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.Notifications;

public interface INotificationRepository : IRepository<Notification, NotificationId>
{
    /// <summary>
    /// Every notification of the recipient (unordered; callers filter by sender access, order & page).
    /// </summary>
    Task<IReadOnlyList<Notification>> GetByRecipientAsync(UserId recipientId, CancellationToken cancellationToken = default);
}
