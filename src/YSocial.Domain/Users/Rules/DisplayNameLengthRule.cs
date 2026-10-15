using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record DisplayNameLengthRule(string DisplayName) : IClassifiedRule
{
    private const int MaxLength = 50;
    public string Message => $"Display name cannot exceed {MaxLength} characters.";

    public bool BrokenWhen => DisplayName.Length > MaxLength;

    public string Code => ErrorCodes.ProfileFieldInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
