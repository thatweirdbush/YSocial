using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostContentMustNotBeEmptyRule(string Content) : IClassifiedRule
{
    public string Message => "Post's content cannot be empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Content);

    public string Code => ErrorCodes.PostContentInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
