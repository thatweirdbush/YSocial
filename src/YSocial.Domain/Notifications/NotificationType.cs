using Microservice.BuildingBlocks.Domain.Enumerations;

namespace YSocial.Domain.Notifications;

public sealed record NotificationType(int Value, string Name) : Enumeration<NotificationType>
{
    public static readonly NotificationType FollowRequested = new(1, nameof(FollowRequested));
    public static readonly NotificationType FollowAccepted = new(2, nameof(FollowAccepted));
    public static readonly NotificationType NewComment = new(3, nameof(NewComment));
    public static readonly NotificationType NewLike = new(4, nameof(NewLike));
    public static readonly NotificationType NewFollow = new(5, nameof(NewFollow));
}
