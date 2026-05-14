using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.UserRelations.Rules;

internal sealed record TargetMustNotHaveBlockedObserverRule(bool IsBlockedByTarget) : IBusinessRule
{
    public string Message => "You cannot follow this user."; // Generic message for privacy

    public bool BrokenWhen => IsBlockedByTarget;
}
