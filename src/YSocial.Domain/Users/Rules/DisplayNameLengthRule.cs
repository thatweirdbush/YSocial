using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record DisplayNameLengthRule(string DisplayName) : IBusinessRule
{
    private const int MaxLength = 50;
    public string Message => $"Display name cannot exceed {MaxLength} characters.";

    public bool BrokenWhen => DisplayName.Length > MaxLength;
}
