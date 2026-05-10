using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Comments.Rules;

internal sealed record CommentContentMustNotBeEmptyRule(string Content) : IBusinessRule
{
    public string Message => "Comment content cannot be empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(Content);
}
