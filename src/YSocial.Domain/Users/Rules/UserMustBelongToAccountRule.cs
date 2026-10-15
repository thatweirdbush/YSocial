using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Users.Rules;

internal sealed record UserMustBelongToAccountRule(IReadOnlyList<User> Users, UserId TargetUserId) : IClassifiedRule
{
    public string Message => $"The user with ID '{TargetUserId.Value}' does not belong to the specified account.";

    public bool BrokenWhen => Users.All(u => u.Id != TargetUserId);

    public string Code => ErrorCodes.ProfileNotOwned;

    public RuleViolationKind Kind => RuleViolationKind.Forbidden;
}
