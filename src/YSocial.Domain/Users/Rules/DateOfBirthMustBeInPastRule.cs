using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record DateOfBirthMustBeInPastRule(DateTime? DateOfBirth) : IClassifiedRule
{
    public string Message => "Date of birth must be in the past.";

    public bool BrokenWhen => DateOfBirth.HasValue && DateOfBirth.Value >= DateTime.UtcNow.Date;

    public string Code => ErrorCodes.ProfileFieldInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
