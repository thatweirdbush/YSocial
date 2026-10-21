namespace YSocial.Application.Models;

/// <summary>
/// ONLY <c>GET /api/users/me</c> (owner): the only place exposing email, the account profiles and owner-only demographics
/// (<c>Gender</c> camelCase name, <c>DateOfBirth</c> date part).
/// </summary>
public sealed record MeDto(
    UserProfileDto Profile,
    string Email,
    IReadOnlyList<ProfileSummaryDto> Profiles,
    string Gender,
    DateOnly? DateOfBirth);

/// <summary>
/// Profile switcher entry.
/// </summary>
public sealed record ProfileSummaryDto(Guid Id, string Username, string DisplayName, string? AvatarUrl, bool IsDefault);
