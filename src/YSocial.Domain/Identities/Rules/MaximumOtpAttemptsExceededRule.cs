using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record MaximumOtpAttemptsExceededRule(bool IsMaxReached) : IClassifiedRule
{
    public string Message => "Maximum OTP verification attempts exceeded. Please request a new code.";

    public bool BrokenWhen => IsMaxReached;

    public string Code => ErrorCodes.OtpAttemptsExceeded;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
