using CommunityToolkit.Common;
using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryISOMustContainsOnlyLetters(string ISO) : IBusinessRule
{
    public string Message => "Country ISO must contains only letters.";

    public bool BrokenWhen => ISO.IsCharacterString() is false;
}
