using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Posts;

namespace YSocial.Domain.Likes.Rules;

internal sealed record PostIdMustNotBeEmptyRule(PostId PostId) : IBusinessRule
{
    public string Message => "Post identifier cannot be empty.";

    public bool BrokenWhen => PostId.Value == Guid.Empty;
}
