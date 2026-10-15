using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record PasswordHashMustNotBeEmptyRule(string Hash) : IClassifiedRule
{
    public string Message => "Password hash cannot be empty or whitespace.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Hash);

    public string Code => ErrorCodes.BusinessRuleViolated;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
