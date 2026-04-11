using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Posts.Rules;

internal sealed record PostContentLengthLimitRule(string Content) : IBusinessRule
{
    private const int Limit = 2000;
    public string Message => $"Post's content must not exceed {Limit} characters.";
    public bool BrokenWhen => Content?.Length > Limit;
}
