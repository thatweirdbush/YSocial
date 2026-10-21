namespace YSocial.Api.Models.Notifications;

/// <summary>
/// Full replacement; every field is required (a missing bool would silently bind to <c>false</c>).
/// </summary>
public sealed record UpdateNotificationPreferencesRequest(bool? Likes, bool? Replies, bool? Follows);
