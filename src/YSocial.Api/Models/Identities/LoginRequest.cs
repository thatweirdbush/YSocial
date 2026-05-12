namespace YSocial.Api.Models.Identities;

public sealed record LoginRequest(string LoginId, string Password, string DeviceId);
