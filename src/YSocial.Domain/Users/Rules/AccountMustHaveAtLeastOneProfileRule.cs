using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record AccountMustHaveAtLeastOneProfileRule(int CurrentProfileCount) : IBusinessRule
{
    public string Message => "An account must have at least one active user profile.";

    public bool BrokenWhen => CurrentProfileCount <= 1;
}
