using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Notifications.Rules;

internal sealed record NotificationContentMustNotBeEmptyRule(string Title, string Content) : IBusinessRule
{
    public string Message => "Notification title and content must not be empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Title) || string.IsNullOrWhiteSpace(Content);
}
