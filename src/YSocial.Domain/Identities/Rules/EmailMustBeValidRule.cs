using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record EmailMustBeValidRule(string Email) : IClassifiedRule
{
    public string Message => "Invalid email.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Email) || !Email.Contains('@');

    public string Code => ErrorCodes.ValidationFailed;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
