using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record CannotDeleteDefaultUserRule(bool IsDefault) : IBusinessRule
{
    public string Message => "Cannot delete the default user profile. Please set another profile as default first.";

    public bool BrokenWhen => IsDefault;
}
