namespace YSocial.Domain.Notifications;

/// <summary>
/// FE grouping of <see cref="NotificationType"/> (list filter, DTO <c>kind</c>, preferences).
/// </summary>
public static class NotificationKind
{
    public const string Like = "like";
    public const string Reply = "reply";
    public const string Follow = "follow";

    public static IReadOnlyList<string> All { get; } = [Like, Reply, Follow];

    /// <summary>
    /// Kind of a type; null for a type without a kind.
    /// </summary>
    public static string? Of(NotificationType type)
    {
        if (type == NotificationType.NewLike)
        {
            return Like;
        }

        if (type == NotificationType.NewComment)
        {
            return Reply;
        }

        if (type == NotificationType.NewFollow
            || type == NotificationType.FollowRequested
            || type == NotificationType.FollowAccepted)
        {
            return Follow;
        }

        return null;
    }

    /// <summary>
    /// Case-insensitive parse to the canonical lowercase kind.
    /// </summary>
    public static bool TryParse(string? value, out string kind)
    {
        kind = All.FirstOrDefault(k => string.Equals(k, value, StringComparison.OrdinalIgnoreCase)) ?? string.Empty;
        return kind.Length > 0;
    }
}
