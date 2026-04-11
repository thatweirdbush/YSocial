using Microservice.BuildingBlocks.Domain.BusinessRules;

namespace YSocial.Domain.Identities.Rules;

public class RefreshTokenMustNotBeExpiredRule(DateTime ExpiryTime) : IBusinessRule
{
    public string Message => "Refresh token expiry time must be in the future.";
    public bool BrokenWhen => ExpiryTime <= DateTime.UtcNow;
}
