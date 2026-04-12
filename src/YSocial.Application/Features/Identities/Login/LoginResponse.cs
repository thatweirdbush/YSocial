namespace YSocial.Application.Features.Identities.Login;

/// <summary>
/// DTO representing authentication tokens returned upon successful login.
/// </summary>
public sealed record LoginResponse(string AccessToken, string RefreshToken, DateTime RefreshTokenExpiry);
