using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

public sealed class OnlyDeleterCanRestoreCommentRule(UserId? deletedBy, UserId editorId) : IBusinessRule
{
    public bool BrokenWhen => deletedBy != null && deletedBy != editorId;

    public string Message => "Only the person who deleted the comment can restore it.";
}
