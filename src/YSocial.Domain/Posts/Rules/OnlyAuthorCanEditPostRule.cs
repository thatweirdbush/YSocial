using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Posts.Rules;

internal sealed record OnlyAuthorCanEditPostRule(UserId AuthorId, UserId EditorId) : IBusinessRule
{
    public string Message => "Only the author can edit this post.";
    public bool BrokenWhen => AuthorId != EditorId;
}
