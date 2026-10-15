using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Notifications.Rules;

internal sealed record OnlyRecipientCanReadNotificationRule(UserId CurrentUserId, UserId RecipientId) : IClassifiedRule
{
    public string Message => "Only the recipient can mark this notification as read.";

    public bool BrokenWhen => CurrentUserId != RecipientId;

    public string Code => ErrorCodes.NotNotificationRecipient;

    public RuleViolationKind Kind => RuleViolationKind.Forbidden;
}
