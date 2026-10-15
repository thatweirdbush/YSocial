namespace YSocial.Application.Models;

/// <summary>
/// ONLY <c>GET /api/users/me</c> (owner): the only place exposing email and the account profiles.
/// </summary>
public sealed record MeDto(UserProfileDto Profile, string Email, IReadOnlyList<ProfileSummaryDto> Profiles);

/// <summary>
/// Profile switcher entry.
/// </summary>
public sealed record ProfileSummaryDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, bool IsDefault);
