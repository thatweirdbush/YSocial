namespace YSocial.Api.Models.Users;

public sealed record SwitchProfileRequest(Guid ProfileId, string RefreshToken);
