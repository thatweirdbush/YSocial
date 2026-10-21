namespace YSocial.Application.Models;

/// <summary>
/// One sign-in of the account (token family). <c>Id</c> = active head token id (changes on rotation).
/// <c>LastTokenIssuedAt</c> = last login / refresh / switch, NOT user activity.
/// </summary>
public sealed record SessionDto(
    Guid Id,
    string? UserAgent,
    string? ProfileUsername,
    DateTime CreatedAt,
    DateTime LastTokenIssuedAt,
    bool IsCurrent);
