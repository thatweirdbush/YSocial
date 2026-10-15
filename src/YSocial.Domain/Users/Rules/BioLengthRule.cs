using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record BioLengthRule(string? Bio) : IClassifiedRule
{
    private const int MaxLength = 200;
    public string Message => $"Bio cannot exceed {MaxLength} characters.";

    public bool BrokenWhen => Bio != null && Bio.Length > MaxLength;

    public string Code => ErrorCodes.ProfileFieldInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
