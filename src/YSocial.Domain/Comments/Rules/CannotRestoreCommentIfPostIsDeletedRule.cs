using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Comments.Rules;

public sealed class CannotRestoreCommentIfPostIsDeletedRule(bool isPostDeleted) : IBusinessRule
{
    public bool BrokenWhen => isPostDeleted;

    public string Message => "Cannot restore comment because the associated post is deleted.";
}
