using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryISOMustBeInUppercase(string ISO) : IClassifiedRule
{
    public string Message => "Country ISO must be in uppercase!";

    public bool BrokenWhen => ISO.Any(char.IsLower);

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
