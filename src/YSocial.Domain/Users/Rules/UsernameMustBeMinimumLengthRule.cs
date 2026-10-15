using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record UsernameMustBeMinimumLengthRule(string Username) : IClassifiedRule
{
    public string Message => "Username must have at least 3 characters.";

    public bool BrokenWhen => Username?.Length < 3;

    public string Code => ErrorCodes.ProfileFieldInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
