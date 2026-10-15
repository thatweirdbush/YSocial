using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostContentLengthLimitRule(string Content) : IClassifiedRule
{
    private const int Limit = 2000;
    public string Message => $"Post's content must not exceed {Limit} characters.";
    public bool BrokenWhen => Content?.Length > Limit;

    public string Code => ErrorCodes.PostContentInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
