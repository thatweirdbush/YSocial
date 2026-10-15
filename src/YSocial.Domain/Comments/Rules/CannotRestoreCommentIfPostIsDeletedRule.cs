using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Comments.Rules;

internal sealed record CannotRestoreCommentIfPostIsDeletedRule(bool IsPostDeleted) : IClassifiedRule
{
    public string Message => "Cannot restore comment because the associated post is deleted.";

    public bool BrokenWhen => IsPostDeleted;

    public string Code => ErrorCodes.PostDeleted;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
