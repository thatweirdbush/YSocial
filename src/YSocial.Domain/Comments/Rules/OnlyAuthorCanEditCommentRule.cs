using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

internal sealed record OnlyAuthorCanEditCommentRule(UserId AuthorId, UserId EditorId) : IClassifiedRule
{
    public string Message => "Only the author of the comment can edit it.";

    public bool BrokenWhen => AuthorId != EditorId;

    public string Code => ErrorCodes.NotCommentAuthor;

    public RuleViolationKind Kind => RuleViolationKind.Forbidden;
}
