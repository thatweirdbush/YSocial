using System.Text.RegularExpressions;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed partial record PhoneNumberMustBeValidRule(string? PhoneNumber) : IClassifiedRule
{
    // Allows for an optional leading '+' followed by 9 to 10 digits,
    // with an optional leading '0' before the digits.
    [GeneratedRegex(@"^(\+?\d{1,4})?0?\d{9,10}$", RegexOptions.Compiled)]
    private static partial Regex PhoneNumberRegex();

    public bool BrokenWhen => !string.IsNullOrWhiteSpace(PhoneNumber) && !PhoneNumberRegex().IsMatch(PhoneNumber);

    public string Message => "Phone number format is invalid. It should contain only digits and an optional leading '+'.";

    public string Code => ErrorCodes.ValidationFailed;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
