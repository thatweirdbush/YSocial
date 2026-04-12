namespace YSocial.Api.Models.Identities;

public sealed record LoginRequest(string Email, string Password, string DeviceId);
