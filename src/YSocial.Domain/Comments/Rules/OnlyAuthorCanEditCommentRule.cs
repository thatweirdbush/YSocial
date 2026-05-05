using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

public class OnlyAuthorCanEditCommentRule(UserId authorId, UserId editorId) : IBusinessRule
{
    public string Message => "Only the author of the comment can edit it.";

    public bool BrokenWhen => authorId != editorId;
}
