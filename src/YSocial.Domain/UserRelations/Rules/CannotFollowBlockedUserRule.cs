using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.UserRelations.Rules;

internal sealed record CannotFollowBlockedUserRule(bool HasBlockedTarget) : IClassifiedRule
{
    public string Message => "You cannot follow a user you have blocked. Unblock them first.";

    public bool BrokenWhen => HasBlockedTarget;

    public string Code => ErrorCodes.NotFound;

    public RuleViolationKind Kind => RuleViolationKind.NotFound;
}
