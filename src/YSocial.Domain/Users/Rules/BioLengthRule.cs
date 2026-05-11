using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Users.Rules;

internal sealed record BioLengthRule(string? Bio) : IBusinessRule
{
    private const int MaxLength = 200;
    public string Message => $"Bio cannot exceed {MaxLength} characters.";

    public bool BrokenWhen => Bio != null && Bio.Length > MaxLength;
}
