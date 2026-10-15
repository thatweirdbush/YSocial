using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Identities.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Identities;

public class RefreshToken : Entity<RefreshTokenId>
{
    public AccountId AccountId { get; private set; }

    /// <summary>
    /// Profile the session is bound to (kept by rotation, changed only by switch profile).
    /// </summary>
    public UserId UserId { get; private set; }
    public string Token { get; private set; }
    public DateTime ExpiryTime { get; private set; }
    public string DeviceId { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime? RevokedAt { get; private set; }

    /// <summary>
    /// Successor issued when this token was rotated (token family).
    /// </summary>
    public RefreshTokenId? ReplacedByTokenId { get; private set; }

    public bool IsActive => RevokedAt == null && ExpiryTime > DateTime.UtcNow;

    internal RefreshToken(AccountId accountId, UserId userId, string token, DateTime expiryTime, string deviceId)
    {
        Id = RefreshTokenId.New();
        AccountId = accountId;
        UserId = userId;
        Token = token;
        ExpiryTime = expiryTime;
        DeviceId = deviceId;
        CreatedAt = DateTime.UtcNow;
    }

    internal static RefreshToken Create(AccountId accountId, UserId userId, string token, DateTime expiryTime, string deviceId)
    {
        CheckRule(new RefreshTokenValueNotEmptyRule(token));
        CheckRule(new RefreshTokenMustNotBeExpiredRule(expiryTime));

        return new RefreshToken(accountId, userId, token, expiryTime, deviceId);
    }

    internal void Revoke()
    {
        RevokedAt ??= DateTime.UtcNow;
    }

    internal void MarkReplacedBy(RefreshTokenId successorId)
    {
        ReplacedByTokenId = successorId;
    }
}
