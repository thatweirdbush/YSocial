using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record InvalidOtpRule(bool IsOtpValid) : IClassifiedRule
{
    public string Message => "Invalid or expired OTP.";

    public bool BrokenWhen => !IsOtpValid;

    public string Code => ErrorCodes.InvalidOtp;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
