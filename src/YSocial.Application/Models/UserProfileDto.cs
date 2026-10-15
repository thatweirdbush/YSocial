namespace YSocial.Application.Models;

/// <summary>
/// Public profile projection (FE <c>UserProfile</c>). SAME field set for every viewer incl. the owner:
/// never carries email or account profiles. Counts are computed on read through the access policy.
/// </summary>
/// <param name="FollowStatus"><c>none</c> | <c>pending</c> | <c>accepted</c> (viewer to target edge).</param>
/// <param name="ViewerMarkedCloseFriend">Flag set by the viewer, dormant ones included.</param>
/// <param name="IsBlocked">True ONLY inside the viewer's own block list (D14 exception).</param>
/// <param name="IsBlockedBy">Always false: any read of such a profile is 404 (kept for FE type compat).</param>
public sealed record UserProfileDto(
    Guid Id,
    string Username,
    string DisplayName,
    string? Bio,
    string? AvatarUrl,
    string? CoverUrl,
    int FollowersCount,
    int FollowingCount,
    bool IsPrivate,
    bool IsVerified,
    string FollowStatus,
    bool IsFollowing,
    bool ViewerMarkedCloseFriend,
    bool IsMuted,
    bool IsBlocked,
    bool IsBlockedBy);
