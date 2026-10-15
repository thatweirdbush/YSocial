using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Posts;

namespace YSocial.Domain.Comments.Rules;

internal sealed record PostMustAllowCommentsRule(Post Post) : IClassifiedRule
{
    public string Message => "This post does not allow comments.";

    public bool BrokenWhen => !Post.AllowComments;

    public string Code => ErrorCodes.CommentsDisabled;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
