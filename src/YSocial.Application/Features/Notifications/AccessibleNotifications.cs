using YSocial.Application.Features.Access;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Notifications;

/// <summary>
/// Notifications of the viewer whose sender is still accessible (not blocked either way, not deleted), newest first.
/// Shared by the list, the unread count and the page so every number uses the SAME filter (§4.4).
/// </summary>
internal sealed class AccessibleNotifications(
    INotificationRepository notificationRepository,
    IUserRepository userRepository,
    IViewerAccessPolicy accessPolicy)
{
    public async Task<IReadOnlyList<(Notification Notification, User Sender)>> LoadAsync(UserId viewerId, CancellationToken cancellationToken)
    {
        var all = await notificationRepository.GetByRecipientAsync(viewerId, cancellationToken);
        var senderIds = all.Select(n => n.SenderId).Distinct().ToList();

        var users = await userRepository.GetUsersByIdsAsync(senderIds, cancellationToken);
        var context = await accessPolicy.GetContextAsync(viewerId, senderIds, cancellationToken);
        var senders = context.FilterUsers(users).ToDictionary(u => u.Id);

        return all
            .Where(n => senders.ContainsKey(n.SenderId))
            .OrderByDescending(n => n.CreatedAt)
            .ThenBy(n => n.Id.Value)
            .Select(n => (n, senders[n.SenderId]))
            .ToList();
    }
}
