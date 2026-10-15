using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.UserRelations.Rules;

internal sealed record CloseFriendRequiresAcceptedFollowRule(bool HasAcceptedFollow) : IClassifiedRule
{
    public string Message => "You must be following the user to add them as a close friend.";

    public bool BrokenWhen => !HasAcceptedFollow;

    public string Code => ErrorCodes.CloseFriendRequiresAcceptedFollow;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
