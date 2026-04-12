using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Identities.Rules;

namespace YSocial.Domain.Identities;

public class RefreshToken : Entity<RefreshTokenId>
{
    public AccountId AccountId { get; private set; }
    public string Token { get; private set; }
    public DateTime ExpiryTime { get; private set; }
    public string DeviceId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? RevokedAt { get; private set; }

    public bool IsActive => RevokedAt == null && ExpiryTime > DateTime.UtcNow;

    internal RefreshToken(AccountId accountId, string token, DateTime expiryTime, string deviceId)
    {
        Id = RefreshTokenId.New();
        AccountId = accountId;
        Token = token;
        ExpiryTime = expiryTime;
        DeviceId = deviceId;
        CreatedAt = DateTime.UtcNow;
    }

    internal static RefreshToken Create(AccountId accountId, string token, DateTime expiryTime, string deviceId)
    {
        CheckRule(new RefreshTokenMustBeValidRule(token));
        CheckRule(new RefreshTokenMustNotBeExpiredRule(expiryTime));
        
        return new RefreshToken(accountId, token, expiryTime, deviceId);
    }

    internal void Revoke()
    {
        RevokedAt ??= DateTime.UtcNow;
    }
}
