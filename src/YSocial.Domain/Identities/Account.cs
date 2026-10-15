using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using System.Security.Cryptography;
using YSocial.Domain.Identities.Events;
using YSocial.Domain.Identities.Rules;

namespace YSocial.Domain.Identities;

public class Account : AggregateRoot<AccountId>, ISoftDeletable
{
    private const int DefaultRefreshTokenExpiryDays = 7;

    #region Properties
    public string Email { get; private set; }
    public string? PhoneNumber { get; private set; }
    public PasswordHash PasswordHash { get; private set; }
    public UserRole Role { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsActive { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    private readonly List<RefreshToken> _refreshTokens = [];
    public IReadOnlyCollection<RefreshToken> RefreshTokens => _refreshTokens.AsReadOnly();

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
    public static Account Create(string email, string? phoneNumber, PasswordHash passwordHash)
    {
        CheckRule(new EmailMustBeValidRule(email));

        // Phone number is optional, only validate if it's provided
        if (!string.IsNullOrWhiteSpace(phoneNumber))
        {
            CheckRule(new PhoneNumberMustBeValidRule(phoneNumber));
        }

        var account = new Account(email, phoneNumber, passwordHash);

        account.AddDomainEvent(new AccountCreatedEvent(account.Id, account.Email));
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

    public void Login(string plainPassword, IPasswordHasher passwordHasher)
    {
        CheckRule(new AccountMustBeActiveRule(IsActive));

        var isVerified = passwordHasher.Verify(PasswordHash.Value, plainPassword);
        CheckRule(new InvalidCredentialsRule(isVerified));
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

    public RefreshToken AddRefreshToken(string deviceId)
    {
        RemoveExpiredTokens();

        var activeSessionCount = _refreshTokens.Count(t => t.IsActive);
        CheckRule(new DeviceSessionLimitRule(activeSessionCount));

        return AddRefreshTokenInternal(deviceId);
    }

    public void RevokeRefreshToken(string token)
    {
        var refreshToken = _refreshTokens.FirstOrDefault(t => t.Token == token);
        refreshToken?.Revoke();
    }

    public RefreshToken RotateRefreshToken(string oldToken)
    {
        var refreshToken = _refreshTokens.FirstOrDefault(t => t.Token == oldToken);
        CheckRule(new RefreshTokenMustBeActiveRule(refreshToken));

        refreshToken!.Revoke();

        return AddRefreshTokenInternal(refreshToken.DeviceId);
    }

    private RefreshToken AddRefreshTokenInternal(string deviceId)
    {
        var tokenValue = Guid.NewGuid().ToString();
        var expiryTime = DateTime.UtcNow.AddDays(DefaultRefreshTokenExpiryDays);

        var refreshTokenEntity = RefreshToken.Create(Id, tokenValue, expiryTime, deviceId);
        _refreshTokens.Add(refreshTokenEntity);

        return refreshTokenEntity;
    }

    public void RevokeAllRefreshTokens()
    {
        foreach (var token in _refreshTokens.Where(t => t.IsActive))
        {
            token.Revoke();
        }
    }

    public void RemoveExpiredTokens()
    {
        _refreshTokens.RemoveAll(t => !t.IsActive);
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
