using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Posts;

namespace YSocial.Domain.Comments.Rules;

public class PostMustAllowCommentsRule(Post post) : IBusinessRule
{
    public string Message => "This post does not allow comments.";

    public bool BrokenWhen => !post.AllowComments;
}
