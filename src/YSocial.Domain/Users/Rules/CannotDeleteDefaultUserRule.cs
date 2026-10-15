using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record CannotDeleteDefaultUserRule(bool IsDefault) : IClassifiedRule
{
    public string Message => "Cannot delete the default user profile. Please set another profile as default first.";

    public bool BrokenWhen => IsDefault;

    public string Code => ErrorCodes.CannotDeleteDefaultProfile;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
