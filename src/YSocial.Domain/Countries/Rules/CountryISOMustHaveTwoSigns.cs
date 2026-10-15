using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryISOMustHaveTwoSigns(string ISO) : IClassifiedRule
{
    public string Message => "Country ISO must have two signs!";

    public bool BrokenWhen => ISO.Length is not 2;

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
