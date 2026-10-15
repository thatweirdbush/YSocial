using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Posts;

namespace YSocial.Domain.Comments.Rules;

internal sealed record ParentCommentMustBelongToPostRule(PostId PostId, Comment? ParentComment) : IClassifiedRule
{
    public string Message => "The parent comment must belong to the same post.";

    public bool BrokenWhen => ParentComment is not null && ParentComment.PostId != PostId;

    public string Code => ErrorCodes.ParentCommentMismatch;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
