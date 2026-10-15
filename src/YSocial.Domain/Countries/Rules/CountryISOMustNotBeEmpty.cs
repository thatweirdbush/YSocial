using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryISOMustNotBeEmpty(string ISO) : IClassifiedRule
{
    public string Message => "Country ISO must not be empty!";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(ISO);

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
