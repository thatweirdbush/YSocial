using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Countries.Rules;

internal sealed record CountryNameMustNotBeEmpty(string Name) : IClassifiedRule
{
    public string Message => "Country name must not be empty!";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Name);

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
