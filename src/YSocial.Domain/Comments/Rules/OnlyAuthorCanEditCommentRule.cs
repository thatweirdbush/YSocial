using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

internal sealed record OnlyAuthorCanEditCommentRule(UserId AuthorId, UserId EditorId) : IBusinessRule
{
    public string Message => "Only the author of the comment can edit it.";

    public bool BrokenWhen => AuthorId != EditorId;
}
