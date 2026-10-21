using Microservice.BuildingBlocks.Domain.ValueObjects;
using YSocial.Domain.Notifications;

namespace YSocial.Domain.Users;

/// <summary>
/// Which notification kinds a profile receives. A disabled kind is skipped at publish time (no row, no push).
/// </summary>
public sealed record NotificationPreferences : ValueObject
{
    public bool Likes { get; private set; }
    public bool Replies { get; private set; }
    public bool Follows { get; private set; }

    private NotificationPreferences() { }

    public NotificationPreferences(bool likes, bool replies, bool follows)
    {
        Likes = likes;
        Replies = replies;
        Follows = follows;
    }

    public static NotificationPreferences Default() => new(true, true, true);

    /// <summary>
    /// Whether a notification of <paramref name="type"/> is wanted; a type without a kind is always allowed.
    /// </summary>
    public bool Allows(NotificationType type) => NotificationKind.Of(type) switch
    {
        NotificationKind.Like => Likes,
        NotificationKind.Reply => Replies,
        NotificationKind.Follow => Follows,
        _ => true
    };
}
