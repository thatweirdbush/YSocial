using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Posts;

namespace YSocial.Domain.Likes.Rules;

internal sealed record PostIdMustNotBeEmptyRule(PostId PostId) : IClassifiedRule
{
    public string Message => "Post identifier cannot be empty.";

    public bool BrokenWhen => PostId.Value == Guid.Empty;

    public string Code => ErrorCodes.ValidationFailed;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
