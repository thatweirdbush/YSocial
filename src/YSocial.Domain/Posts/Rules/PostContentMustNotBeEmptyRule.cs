using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostContentMustNotBeEmptyRule(string Content) : IBusinessRule
{
    public string Message => "Post's content cannot be empty.";
    public bool BrokenWhen => string.IsNullOrWhiteSpace(Content);
}
