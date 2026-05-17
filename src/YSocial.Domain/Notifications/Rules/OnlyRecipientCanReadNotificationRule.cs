using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Notifications.Rules;

internal sealed record OnlyRecipientCanReadNotificationRule(UserId CurrentUserId, UserId RecipientId) : IBusinessRule
{
    public string Message => "Only the recipient can mark this notification as read.";

    public bool BrokenWhen => CurrentUserId != RecipientId;
}
