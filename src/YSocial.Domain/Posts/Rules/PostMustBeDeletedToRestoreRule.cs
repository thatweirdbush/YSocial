using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostMustBeDeletedToRestoreRule(bool IsDeleted) : IClassifiedRule
{
    public string Message => "The post must be deleted before it can be restored.";

    public bool BrokenWhen => !IsDeleted;

    public string Code => ErrorCodes.PostNotDeleted;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
