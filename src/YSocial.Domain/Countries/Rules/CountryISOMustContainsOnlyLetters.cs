using CommunityToolkit.Common;
using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryISOMustContainsOnlyLetters(string ISO) : IClassifiedRule
{
    public string Message => "Country ISO must contains only letters.";

    public bool BrokenWhen => ISO.IsCharacterString() is false;

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
