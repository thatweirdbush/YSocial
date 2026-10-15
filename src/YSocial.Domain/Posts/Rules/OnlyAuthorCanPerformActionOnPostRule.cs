using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Posts.Rules;

internal sealed record OnlyAuthorCanPerformActionOnPostRule(UserId AuthorId, UserId EditorId) : IClassifiedRule
{
    public string Message => "Only the author can perform this action on this post.";

    public bool BrokenWhen => AuthorId != EditorId;

    public string Code => ErrorCodes.NotPostAuthor;

    public RuleViolationKind Kind => RuleViolationKind.Forbidden;
}
