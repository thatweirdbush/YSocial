using Microservice.BuildingBlocks.Domain.BusinessRules;
using System.Text.RegularExpressions;

namespace YSocial.Domain.Identities.Rules;

internal sealed partial record PhoneNumberMustBeValidRule(string? PhoneNumber) : IBusinessRule
{
    // Allows for an optional leading '+' followed by 9 to 10 digits,
    // with an optional leading '0' before the digits.
    [GeneratedRegex(@"^(\+?\d{1,4})?0?\d{9,10}$", RegexOptions.Compiled)]
    private static partial Regex PhoneNumberRegex();

    public bool BrokenWhen => !string.IsNullOrWhiteSpace(PhoneNumber) && !PhoneNumberRegex().IsMatch(PhoneNumber);

    public string Message => "Phone number format is invalid. It should contain only digits and an optional leading '+'.";
}
