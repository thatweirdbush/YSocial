using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Notifications.Rules;

internal sealed record CannotSendNotificationToYourselfRule(UserId SenderId, UserId RecipientId) : IClassifiedRule
{
    public string Message => "You cannot send a notification to yourself.";

    public bool BrokenWhen => SenderId == RecipientId;

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
