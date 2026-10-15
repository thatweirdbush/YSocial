using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes.Rules;

internal sealed record UserIdMustNotBeEmptyRule(UserId UserId) : IClassifiedRule
{
    public string Message => "User identifier cannot be empty.";

    public bool BrokenWhen => UserId.Value == Guid.Empty;

    public string Code => ErrorCodes.ValidationFailed;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
