using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Posts.Rules;

internal sealed record OnlyAuthorCanPerformActionOnPostRule(UserId AuthorId, UserId EditorId) : IBusinessRule
{
    public string Message => "Only the author can perform this action on this post.";

    public bool BrokenWhen => AuthorId != EditorId;
}
