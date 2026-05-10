using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record UserMustBelongToAccountRule(IReadOnlyList<User> Users, UserId TargetUserId) : IBusinessRule
{
    public string Message => $"The user with ID '{TargetUserId.Value}' does not belong to the specified account.";

    public bool BrokenWhen => Users.All(u => u.Id != TargetUserId);
}
