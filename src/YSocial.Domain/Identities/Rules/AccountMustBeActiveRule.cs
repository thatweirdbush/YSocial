using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record AccountMustBeActiveRule(bool IsActive) : IBusinessRule
{
    public string Message => "Account is deactivated.";

    public bool BrokenWhen => !IsActive;
}
