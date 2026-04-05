using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryISOMustNotBeEmpty(string ISO) : IBusinessRule
{
    public string Message => "Country ISO must not be empty!";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(ISO);
}
