using YSocial.Application.Abstractions.Notifications;
using YSocial.Application.Models;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Notifications;

/// <summary>
/// Single place that turns a domain event into a stored notification plus an outbox push. Skips self notifications &
/// kinds the recipient switched off (no row, no push).
/// </summary>
internal sealed class NotificationPublisher(
    INotificationRepository notificationRepository,
    IUserRepository userRepository,
    INotificationOutboxService outboxService)
{
    public async Task PublishAsync(
        UserId recipientId,
        User sender,
        NotificationType type,
        string title,
        string content,
        Guid? targetId,
        CancellationToken cancellationToken)
    {
        if (recipientId == sender.Id)
        {
            return;
        }

        var recipient = await userRepository.GetByIdAsync(recipientId, cancellationToken);
        if (recipient is null || !recipient.NotificationPreferences.Allows(type))
        {
            return;
        }

        var notification = Notification.Create(recipientId, sender.Id, type, title, content, targetId);

        await notificationRepository.AddAsync(notification, cancellationToken);

        var envelope = new NotificationEnvelope(recipientId.Value, NotificationDto.From(notification, sender));

        await outboxService.EnqueueAsync(type.Name, envelope, cancellationToken);
    }
}
