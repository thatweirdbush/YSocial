using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record PasswordHashMustNotBeEmptyRule(string Hash) : IBusinessRule
{
    public string Message => "Password hash cannot be empty or whitespace.";
    public bool BrokenWhen => string.IsNullOrWhiteSpace(Hash);
}
