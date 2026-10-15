using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Users;
using System.Security.Cryptography;
using YSocial.Domain.Identities.Events;
using YSocial.Domain.Identities.Rules;

namespace YSocial.Domain.Identities;

public class Account : AggregateRoot<AccountId>, ISoftDeletable
{
    private const int DefaultRefreshTokenExpiryDays = 7;
    public const int MaxActiveSessions = 5;

    #region Properties
    public string Email { get; private set; }
    public string? PhoneNumber { get; private set; }
    public PasswordHash PasswordHash { get; private set; }
    public UserRole Role { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsActive { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    // Copy-on-write: replaced wholesale (never mutated in place) so lock-free readers enumerate a stable snapshot
    private volatile IReadOnlyList<RefreshToken> _refreshTokens = [];
    public IReadOnlyCollection<RefreshToken> RefreshTokens => _refreshTokens;

    private readonly List<PasswordResetToken> _passwordResetTokens = [];
    public IReadOnlyCollection<PasswordResetToken> PasswordResetTokens => _passwordResetTokens.AsReadOnly();

    #endregion

    private Account(string email, string? phoneNumber, PasswordHash passwordHash)
    {
        Id = AccountId.New();
        Email = email;
        PhoneNumber = phoneNumber;
        PasswordHash = passwordHash;
        Role = UserRole.Member;
        CreatedAt = DateTime.UtcNow;
        IsActive = true;
        IsDeleted = false;
    }

    #region Methods
    public static Account Create(string email, string? phoneNumber, PasswordHash passwordHash, string? username = null)
    {
        CheckRule(new EmailMustBeValidRule(email));

        // Phone number is optional, only validate if it's provided
        if (!string.IsNullOrWhiteSpace(phoneNumber))
        {
            CheckRule(new PhoneNumberMustBeValidRule(phoneNumber));
        }

        var account = new Account(email, phoneNumber, passwordHash);

        account.AddDomainEvent(new AccountCreatedEvent(account.Id, account.Email, username ?? email.Split('@')[0]));
        return account;
    }

    public void AssignRole(UserRole newRole)
    {
        Role = newRole;
    }

    public void ChangePassword(PasswordHash newPassword)
    {
        PasswordHash = newPassword;
        RevokeAllRefreshTokens();
    }

    public bool VerifyPassword(string plainPassword, IPasswordHasher passwordHasher)
        => passwordHasher.Verify(PasswordHash.Value, plainPassword);

    /// <summary>
    /// Call ONLY after the password was verified (inactive state is revealed to credential holders only).
    /// </summary>
    public void EnsureCanLogin()
    {
        CheckRule(new AccountMustBeActiveRule(IsActive));
    }

    public void GeneratePasswordResetToken(IPasswordHasher hasher, int expiryMinutes = 15)
    {
        var otp = RandomNumberGenerator.GetInt32(100000, 999999).ToString();
        var hashedToken = hasher.Hash(otp);

        var token = PasswordResetToken.Create(hashedToken, DateTime.UtcNow.AddMinutes(expiryMinutes));
        _passwordResetTokens.Add(token);

        AddDomainEvent(new PasswordResetTokenGeneratedEvent(Id, otp, Email, PhoneNumber));
    }

    public void ResetPassword(string plainToken, string plainNewPassword, IPasswordHasher hasher)
    {
        var activeToken = _passwordResetTokens
            .OrderByDescending(t => t.ExpiryTime)
            .FirstOrDefault(t => !t.IsUsed && !t.IsExpired());

        CheckRule(new PasswordResetTokenMustBeValidRule(activeToken));
        CheckRule(new MaximumOtpAttemptsExceededRule(activeToken!.IsMaxAttemptsReached()));

        if (!hasher.Verify(activeToken.HashedToken, plainToken))
        {
            activeToken.IncrementAttempt();

            // Re-check max attempts after incrementing
            CheckRule(new MaximumOtpAttemptsExceededRule(activeToken.IsMaxAttemptsReached()));

            // Still have attempts left,
            // throw a generic invalid credentials error
            CheckRule(new InvalidOtpRule(false));
        }

        // Success
        activeToken.MarkAsUsed();

        var hashedValue = hasher.Hash(plainNewPassword);
        var newPasswordHash = PasswordHash.Create(hashedValue);

        // Change password and revoke all existing refresh tokens
        ChangePassword(newPasswordHash);
    }

    /// <summary>
    /// Issues a refresh token bound to a profile; at the session cap the oldest active one is evicted (no error).
    /// Callers MUST hold the account session lock.
    /// </summary>
    public RefreshToken AddRefreshToken(string deviceId, UserId userId)
    {
        RemoveExpiredTokens();

        var active = _refreshTokens.Where(t => t.IsActive).OrderBy(t => t.CreatedAt).ToList();
        foreach (var evicted in active.Take(Math.Max(0, active.Count - MaxActiveSessions + 1)))
        {
            evicted.Revoke();
        }

        return AddRefreshTokenInternal(deviceId, userId);
    }

    /// <summary>
    /// Revokes the token; a rotated token also revokes its active successors (the session it names ends).
    /// </summary>
    public void RevokeRefreshToken(string token)
    {
        var current = _refreshTokens.FirstOrDefault(t => t.Token == token);

        while (current is not null)
        {
            current.Revoke();
            var successorId = current.ReplacedByTokenId;
            current = successorId is null ? null : _refreshTokens.FirstOrDefault(t => t.Id == successorId);
        }
    }

    /// <summary>
    /// Revokes the active token & issues its successor; stays bound to the same profile unless <paramref name="newUserId"/> is set.
    /// </summary>
    public RefreshToken RotateRefreshToken(string oldToken, UserId? newUserId = null)
    {
        var refreshToken = _refreshTokens.FirstOrDefault(t => t.Token == oldToken);
        CheckRule(new RefreshTokenMustBeActiveRule(refreshToken));

        refreshToken!.Revoke();

        var successor = AddRefreshTokenInternal(refreshToken.DeviceId, newUserId ?? refreshToken.UserId);
        refreshToken.MarkReplacedBy(successor.Id);

        return successor;
    }

    private RefreshToken AddRefreshTokenInternal(string deviceId, UserId userId)
    {
        var tokenValue = Guid.NewGuid().ToString();
        var expiryTime = DateTime.UtcNow.AddDays(DefaultRefreshTokenExpiryDays);

        var refreshTokenEntity = RefreshToken.Create(Id, userId, tokenValue, expiryTime, deviceId);
        _refreshTokens = [.. _refreshTokens, refreshTokenEntity];

        return refreshTokenEntity;
    }

    public void RevokeAllRefreshTokens()
    {
        foreach (var token in _refreshTokens.Where(t => t.IsActive))
        {
            token.Revoke();
        }
    }

    /// <summary>
    /// Drops dead tokens, except rotated ones whose family is still alive (logout of an old token must still find it).
    /// </summary>
    public void RemoveExpiredTokens()
    {
        var tokens = _refreshTokens;
        _refreshTokens = tokens.Where(t => t.IsActive || HasActiveSuccessor(tokens, t)).ToList();
    }

    private static bool HasActiveSuccessor(IReadOnlyList<RefreshToken> tokens, RefreshToken token)
    {
        var current = token;
        for (var hops = 0; hops < tokens.Count && current.ReplacedByTokenId is not null; hops++)
        {
            current = tokens.FirstOrDefault(t => t.Id == current.ReplacedByTokenId);
            if (current is null) return false;
            if (current.IsActive) return true;
        }

        return false;
    }

    public void Deactivate()
    {
        IsActive = false;
        AddDomainEvent(new AccountDeactivatedEvent(Id));
    }

    public void Activate()
    {
        IsActive = true;
    }

    public void Delete()
    {
        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
        RevokeAllRefreshTokens();
        AddDomainEvent(new AccountDeletedEvent(Id));
    }

    #endregion
}
