using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Comments.Rules;

internal sealed record CommentMustBeDeletedToRestoreRule(bool IsDeleted) : IClassifiedRule
{
    public string Message => "The comment must be deleted before it can be restored.";

    public bool BrokenWhen => !IsDeleted;

    public string Code => ErrorCodes.CommentNotDeleted;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
