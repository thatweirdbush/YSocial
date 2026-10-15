using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record CannotInteractWithDeletedUserRule(bool IsDeleted) : IClassifiedRule
{
    public string Message => "Cannot interact with a deleted user.";

    public bool BrokenWhen => IsDeleted;

    public string Code => ErrorCodes.NotFound;

    public RuleViolationKind Kind => RuleViolationKind.NotFound;
}
