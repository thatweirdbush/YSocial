using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record EmailMustBeValidRule(string Email) : IBusinessRule
{
    public string Message => "Invalid email.";
    public bool BrokenWhen => string.IsNullOrWhiteSpace(Email) || !Email.Contains('@');
}
