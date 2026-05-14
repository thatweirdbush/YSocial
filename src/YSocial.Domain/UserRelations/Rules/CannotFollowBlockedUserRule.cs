using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.UserRelations.Rules;

internal sealed record CannotFollowBlockedUserRule(bool HasBlockedTarget) : IBusinessRule
{
    public string Message => "You cannot follow a user you have blocked. Unblock them first.";

    public bool BrokenWhen => HasBlockedTarget;
}
