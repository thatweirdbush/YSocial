using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserRelations.Rules;

internal sealed record CannotFollowYourselfRule(UserId ObserverId, UserId TargetId) : IBusinessRule
{
    public string Message => "You cannot follow yourself.";

    public bool BrokenWhen => ObserverId == TargetId;
}
