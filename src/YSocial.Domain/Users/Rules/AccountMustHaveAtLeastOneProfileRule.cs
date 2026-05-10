using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record AccountMustHaveAtLeastOneProfileRule(int CurrentProfileCount) : IBusinessRule
{
    public bool BrokenWhen => CurrentProfileCount <= 1;

    public string Message => "An account must have at least one active user profile.";
}
