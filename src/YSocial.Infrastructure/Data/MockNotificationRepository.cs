using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data;

public class MockNotificationRepository : INotificationRepository
{
    private readonly ConcurrentDictionary<NotificationId, Notification> _notifications = MockDataStore.Notifications;

    public IUnitOfWork UnitOfWork => null!;

    public Task<Notification?> GetByIdAsync(NotificationId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<Notification?> GetByIdAsync(NotificationId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _notifications.TryGetValue(id, out var notification);
        return Task.FromResult(notification);
    }

    public Task AddAsync(Notification notification, CancellationToken cancellationToken = default)
    {
        _notifications.TryAdd(notification.Id, notification);
        return Task.CompletedTask;
    }

    public void Update(Notification notification)
    {
        _notifications.AddOrUpdate(notification.Id, notification, (_, _) => notification);
    }

    public void Remove(Notification notification)
    {
        MockDataStore.CaptureRemovedEvents(notification);
        _notifications.TryRemove(notification.Id, out _);
    }

    public Task<IReadOnlyList<Notification>> GetByRecipientIdAsync(UserId recipientId, int page, int pageSize, CancellationToken cancellationToken = default)
    {
        var result = _notifications.Values
            .Where(n => n.RecipientId == recipientId)
            .OrderByDescending(n => n.CreatedAt) // Order by newest first
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToList();

        return Task.FromResult<IReadOnlyList<Notification>>(result);
    }
}