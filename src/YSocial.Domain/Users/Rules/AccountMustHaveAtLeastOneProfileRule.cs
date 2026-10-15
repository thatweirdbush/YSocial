using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record AccountMustHaveAtLeastOneProfileRule(int CurrentProfileCount) : IClassifiedRule
{
    public string Message => "An account must have at least one active user profile.";

    public bool BrokenWhen => CurrentProfileCount <= 1;

    public string Code => ErrorCodes.AccountRequiresProfile;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
