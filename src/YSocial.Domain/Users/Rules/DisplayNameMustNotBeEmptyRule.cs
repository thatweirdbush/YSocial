using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record DisplayNameMustNotBeEmptyRule(string DisplayName) : IBusinessRule
{
    public string Message => "Display name cannot be empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(DisplayName);
}
