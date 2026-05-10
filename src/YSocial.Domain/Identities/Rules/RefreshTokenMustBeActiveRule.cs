using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

public sealed class RefreshTokenMustBeActiveRule(RefreshToken? refreshToken) : IBusinessRule
{
    public bool BrokenWhen => refreshToken is null || !refreshToken.IsActive;

    public string Message => "Invalid or expired refresh token.";
}
