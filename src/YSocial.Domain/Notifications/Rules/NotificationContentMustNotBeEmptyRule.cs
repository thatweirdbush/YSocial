using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Notifications.Rules;

internal sealed record NotificationContentMustNotBeEmptyRule(string Title, string Content) : IClassifiedRule
{
    public string Message => "Notification title and content must not be empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Title) || string.IsNullOrWhiteSpace(Content);

    public string Code => ErrorCodes.NotificationContentInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
