using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

internal sealed record OnlyDeleterCanRestoreCommentRule(UserId? DeletedBy, UserId EditorId) : IClassifiedRule
{
    public string Message => "Only the person who deleted the comment can restore it.";

    public bool BrokenWhen => DeletedBy != null && DeletedBy != EditorId;

    public string Code => ErrorCodes.NotCommentDeleter;

    public RuleViolationKind Kind => RuleViolationKind.Forbidden;
}
