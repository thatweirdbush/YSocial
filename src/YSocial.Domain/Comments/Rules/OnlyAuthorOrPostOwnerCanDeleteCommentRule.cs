using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

internal sealed record OnlyAuthorOrPostOwnerCanDeleteCommentRule(UserId CommentAuthorId, UserId PostAuthorId, UserId EditorId) : IBusinessRule
{
    public string Message => "Only the author of the comment or the owner of the post can delete this comment.";

    public bool BrokenWhen => EditorId != CommentAuthorId && EditorId != PostAuthorId;
}
