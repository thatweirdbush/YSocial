using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserBlocks.Rules;

internal sealed record CannotBlockYourselfRule(UserId ObserverId, UserId TargetId) : IBusinessRule
{
    public string Message => "You cannot block yourself.";

    public bool BrokenWhen => ObserverId == TargetId;
}
