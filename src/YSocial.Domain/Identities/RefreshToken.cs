using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Identities.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Identities;

public class RefreshToken : Entity<RefreshTokenId>
{
    public const int MaxUserAgentLength = 256;

    public AccountId AccountId { get; private set; }

    /// <summary>
    /// Profile the session is bound to (kept by rotation, changed only by switch profile).
    /// </summary>
    public UserId UserId { get; private set; }
    public string Token { get; private set; }
    public DateTime ExpiryTime { get; private set; }
    public string DeviceId { get; private set; }

    /// <summary>
    /// <c>User-Agent</c> captured at login, copied on rotation (truncated to <see cref="MaxUserAgentLength"/>).
    /// </summary>
    public string? UserAgent { get; private set; }

    /// <summary>
    /// Set once at construction, never mutated (rotation issues a NEW token).
    /// </summary>
    public DateTime CreatedAt { get; private set; }
    public DateTime? RevokedAt { get; private set; }

    /// <summary>
    /// Successor issued when this token was rotated (token family).
    /// </summary>
    public RefreshTokenId? ReplacedByTokenId { get; private set; }

    public bool IsActive => RevokedAt == null && ExpiryTime > DateTime.UtcNow;

#pragma warning disable CS8618
    private RefreshToken() { }
#pragma warning restore CS8618

    internal RefreshToken(AccountId accountId, UserId userId, string token, DateTime expiryTime, string deviceId, string? userAgent)
    {
        Id = RefreshTokenId.New();
        AccountId = accountId;
        UserId = userId;
        Token = token;
        ExpiryTime = expiryTime;
        DeviceId = deviceId;
        UserAgent = Truncate(userAgent);
        CreatedAt = DateTime.UtcNow;
    }

    internal static RefreshToken Create(AccountId accountId, UserId userId, string token, DateTime expiryTime, string deviceId, string? userAgent = null)
    {
        CheckRule(new RefreshTokenValueNotEmptyRule(token));
        CheckRule(new RefreshTokenMustNotBeExpiredRule(expiryTime));

        return new RefreshToken(accountId, userId, token, expiryTime, deviceId, userAgent);
    }

    private static string? Truncate(string? userAgent)
        => userAgent is { Length: > MaxUserAgentLength } ? userAgent[..MaxUserAgentLength] : userAgent;

    internal void Revoke()
    {
        RevokedAt ??= DateTime.UtcNow;
    }

    internal void MarkReplacedBy(RefreshTokenId successorId)
    {
        ReplacedByTokenId = successorId;
    }
}
