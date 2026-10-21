using YSocial.Domain.Users;

namespace YSocial.Domain.Identities;

/// <summary>
/// One sign-in (token family). <see cref="CreatedAt"/> = family root issue (sign-in time),
/// <see cref="LastTokenIssuedAt"/> = active head issue (login / refresh / switch), NOT user activity.
/// </summary>
public sealed record SessionInfo(
    RefreshTokenId HeadId,
    UserId UserId,
    string? UserAgent,
    DateTime CreatedAt,
    DateTime LastTokenIssuedAt);
