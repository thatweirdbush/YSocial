using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record PasswordResetTokenMustBeValidRule(PasswordResetToken? Token) : IClassifiedRule
{
    public string Message => "The password reset token is invalid or has expired.";

    public bool BrokenWhen => Token == null || Token.IsUsed || Token.IsExpired();

    public string Code => ErrorCodes.InvalidOtp;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
