using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record DisplayNameMustNotBeEmptyRule(string DisplayName) : IClassifiedRule
{
    public string Message => "Display name cannot be empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(DisplayName);

    public string Code => ErrorCodes.ProfileFieldInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
