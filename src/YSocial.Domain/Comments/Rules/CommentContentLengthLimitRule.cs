using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Comments.Rules;

internal sealed record CommentContentLengthLimitRule(string Content) : IClassifiedRule
{
    private const int Limit = 1000;
    public string Message => $"Comment content must not exceed {Limit} characters.";
    public bool BrokenWhen => Content?.Length > Limit;

    public string Code => ErrorCodes.CommentContentInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
