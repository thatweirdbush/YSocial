using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Comments.Rules;

internal sealed record CannotRestoreCommentIfPostIsDeletedRule(bool IsPostDeleted) : IBusinessRule
{
    public string Message => "Cannot restore comment because the associated post is deleted.";

    public bool BrokenWhen => IsPostDeleted;
}
