using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Comments.Rules;

internal sealed record CommentContentMustNotBeEmptyRule(string Content) : IClassifiedRule
{
    public string Message => "Comment content cannot be empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Content);

    public string Code => ErrorCodes.CommentContentInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
