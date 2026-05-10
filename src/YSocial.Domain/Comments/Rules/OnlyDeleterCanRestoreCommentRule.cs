using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Comments.Rules;

internal sealed record OnlyDeleterCanRestoreCommentRule(UserId? DeletedBy, UserId EditorId) : IBusinessRule
{
    public string Message => "Only the person who deleted the comment can restore it.";

    public bool BrokenWhen => DeletedBy != null && DeletedBy != EditorId;
}
