using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryNameMustNotBeEmpty(string Name) : IBusinessRule
{
    public string Message => "Country name must not be empty!";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Name);
}
