using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record CannotInteractWithDeletedUserRule(bool IsDeleted) : IBusinessRule
{
    public string Message => "Cannot interact with a deleted user.";

    public bool BrokenWhen => IsDeleted;
}
