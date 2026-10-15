using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.UserRelations.Rules;

internal sealed record TargetMustNotHaveBlockedObserverRule(bool IsBlockedByTarget) : IClassifiedRule
{
    public string Message => "You cannot follow this user."; // Generic message for privacy

    public bool BrokenWhen => IsBlockedByTarget;

    public string Code => ErrorCodes.NotFound;

    public RuleViolationKind Kind => RuleViolationKind.NotFound;
}
