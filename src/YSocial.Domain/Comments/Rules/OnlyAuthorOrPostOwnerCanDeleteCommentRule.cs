using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

public class OnlyAuthorOrPostOwnerCanDeleteCommentRule(UserId commentAuthorId, UserId postAuthorId, UserId editorId) : IBusinessRule
{
    public string Message => "Only the author of the comment or the owner of the post can delete this comment.";

    public bool BrokenWhen => editorId != commentAuthorId && editorId != postAuthorId;
}
