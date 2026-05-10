using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Posts;

namespace YSocial.Domain.Comments.Rules;

internal sealed record PostMustAllowCommentsRule(Post Post) : IBusinessRule
{
    public string Message => "This post does not allow comments.";

    public bool BrokenWhen => !Post.AllowComments;
}
