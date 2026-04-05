using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryISOMustHaveTwoSigns(string ISO) : IBusinessRule
{
    public string Message => "Country ISO must have two signs!";

    public bool BrokenWhen => ISO.Length is not 2;
}
