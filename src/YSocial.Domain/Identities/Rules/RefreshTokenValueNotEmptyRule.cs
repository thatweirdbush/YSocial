using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record RefreshTokenValueNotEmptyRule(string RefreshToken) : IBusinessRule
{
    public string Message => "Refresh token cannot be null or empty.";

    public bool BrokenWhen => string.IsNullOrWhiteSpace(RefreshToken);
}
