using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

internal sealed record RefreshTokenMustBeActiveRule(RefreshToken? RefreshToken) : IBusinessRule
{
    public string Message => "Invalid or expired refresh token.";

    public bool BrokenWhen => RefreshToken is null || !RefreshToken.IsActive;
}
