using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostContentMustNotBeEmptyRule(string Content) : IBusinessRule
{
    public string Message => "Post's content must not be blank.";
    public bool BrokenWhen => string.IsNullOrWhiteSpace(Content);
}
