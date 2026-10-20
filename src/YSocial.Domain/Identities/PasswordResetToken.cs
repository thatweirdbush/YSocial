using Microservice.BuildingBlocks.Domain.Entities;

namespace YSocial.Domain.Identities;

public sealed class PasswordResetToken : Entity<Guid>
{
    public const int MaxAttempts = 5;
    public const int DefaultExpiryMinutes = 15;

    public string HashedToken { get; private set; }
    public DateTime ExpiryTime { get; private set; }
    public bool IsUsed { get; private set; }
    public int AttemptCount { get; private set; }

#pragma warning disable CS8618
    private PasswordResetToken() { }
#pragma warning restore CS8618

    private PasswordResetToken(string hashedToken, DateTime expiryTime)
    {
        Id = Guid.NewGuid();
        HashedToken = hashedToken;
        ExpiryTime = expiryTime;
        IsUsed = false;
        AttemptCount = 0;
    }

    public static PasswordResetToken Create(string hashedToken, DateTime expiryTime)
    {
        return new PasswordResetToken(hashedToken, expiryTime);
    }

    public void MarkAsUsed()
    {
        IsUsed = true;
    }

    public void IncrementAttempt()
    {
        AttemptCount++;
    }

    public bool IsExpired() => DateTime.UtcNow > ExpiryTime;
    public bool IsMaxAttemptsReached() => AttemptCount >= MaxAttempts;
}
