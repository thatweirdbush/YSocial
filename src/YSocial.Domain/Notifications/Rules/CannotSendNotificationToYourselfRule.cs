using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Notifications.Rules;

internal sealed record CannotSendNotificationToYourselfRule(UserId SenderId, UserId RecipientId) : IBusinessRule
{
    public string Message => "You cannot send a notification to yourself.";

    public bool BrokenWhen => SenderId == RecipientId;
}
