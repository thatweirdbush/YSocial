namespace YSocial.Api.Models.Identities;

public sealed record ResetPasswordRequest(string LoginId, string Otp, string NewPassword);
