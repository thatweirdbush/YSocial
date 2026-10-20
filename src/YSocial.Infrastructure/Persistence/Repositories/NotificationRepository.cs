using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class NotificationRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<Notification, NotificationId>(db, unitOfWork), INotificationRepository
{
    public async Task<IReadOnlyList<Notification>> GetByRecipientAsync(UserId recipientId, CancellationToken cancellationToken = default)
        => await Set.Where(n => n.RecipientId == recipientId).ToListAsync(cancellationToken);
}
