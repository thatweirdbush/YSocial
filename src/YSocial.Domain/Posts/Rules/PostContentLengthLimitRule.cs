using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostContentLengthLimitRule(string Content) : IBusinessRule
{
    public string Message => "Content must not exceed 2000 characters.";
    public bool BrokenWhen => Content?.Length > 2000;
}
