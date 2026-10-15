using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserBlocks.Rules;

internal sealed record CannotBlockYourselfRule(UserId ObserverId, UserId TargetId) : IClassifiedRule
{
    public string Message => "You cannot block yourself.";

    public bool BrokenWhen => ObserverId == TargetId;

    public string Code => ErrorCodes.CannotBlockSelf;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
