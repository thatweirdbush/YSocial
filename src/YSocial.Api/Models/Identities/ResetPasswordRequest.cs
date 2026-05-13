namespace YSocial.Api.Models.Identities;

public class ResetPasswordRequest
{
    public string LoginId { get; set; } = string.Empty;
    public string Otp { get; set; } = string.Empty;
    public string NewPassword { get; set; } = string.Empty;
}
