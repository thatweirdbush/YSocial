using YSocial.Domain.Users;

namespace YSocial.Api.Models.Users;

public sealed record UpdateProfileRequest(
    string DisplayName,
    string? Bio,
    string? AvatarUrl,
    string? CoverUrl,
    Gender Gender,
    DateTime? DateOfBirth);
