using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostMediaLimitRule(int Count) : IClassifiedRule
{
    public const int Limit = 10;

    public string Message => $"A post can carry at most {Limit} media items.";

    public bool BrokenWhen => Count > Limit;

    public string Code => ErrorCodes.PostContentInvalid;

    public RuleViolationKind Kind => RuleViolationKind.Invalid;
}
