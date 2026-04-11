using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Comments.Rules;

internal sealed record CommentContentLengthLimitRule(string Content) : IBusinessRule
{
    private const int Limit = 1000;
    public string Message => $"Comment content must not exceed {Limit} characters.";
    public bool BrokenWhen => Content?.Length > Limit;
}
