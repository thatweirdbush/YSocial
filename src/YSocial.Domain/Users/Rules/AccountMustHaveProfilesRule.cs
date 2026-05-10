using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record AccountMustHaveProfilesRule(IReadOnlyList<User> Users) : IBusinessRule
{
    public string Message => "Account must have at least one profile.";

    public bool BrokenWhen => Users == null || Users.Count == 0;
}
