using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostContentMustNotBeEmptyRule(string Content, bool HasMedia = false) : IClassifiedRule
{
    public string Message => "Post's content cannot be empty.";

    // Media-only posts (uploaded media or an external image url) may have no text
    public bool BrokenWhen => !HasMedia && string.IsNullOrWhiteSpace(Content);

    public string Code => ErrorCodes.PostContentInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
