using Microservice.BuildingBlocks.Domain.BusinessRules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Likes.Rules;

internal sealed record UserIdMustNotBeEmptyRule(UserId UserId) : IBusinessRule
{
    public string Message => "User identifier cannot be empty.";
    public bool BrokenWhen => UserId.Value == Guid.Empty;
}
