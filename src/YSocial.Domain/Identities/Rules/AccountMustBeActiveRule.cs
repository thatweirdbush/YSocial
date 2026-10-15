using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record AccountMustBeActiveRule(bool IsActive) : IClassifiedRule
{
    public string Message => "Account is deactivated.";

    public bool BrokenWhen => !IsActive;

    public string Code => ErrorCodes.AccountInactive;

    public RuleViolationKind Kind => RuleViolationKind.Forbidden;
}
