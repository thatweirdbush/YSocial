using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserRelations.Rules;

internal sealed record CannotMuteYourselfRule(UserId ObserverId, UserId TargetId) : IClassifiedRule
{
    public string Message => "You cannot mute yourself.";

    public bool BrokenWhen => ObserverId == TargetId;

    public string Code => ErrorCodes.CannotMuteSelf;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
