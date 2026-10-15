using YSocial.Domain.Common.Errors;
using YSocial.Domain.Common.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

internal sealed record OnlyAuthorOrPostOwnerCanDeleteCommentRule(UserId CommentAuthorId, UserId PostAuthorId, UserId EditorId) : IClassifiedRule
{
    public string Message => "Only the author of the comment or the owner of the post can delete this comment.";

    public bool BrokenWhen => EditorId != CommentAuthorId && EditorId != PostAuthorId;

    public string Code => ErrorCodes.NotCommentAuthorOrPostOwner;

    public RuleViolationKind Kind => RuleViolationKind.Forbidden;
}
