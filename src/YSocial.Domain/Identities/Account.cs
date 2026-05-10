using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Identities.Events;
using YSocial.Domain.Identities.Rules;

namespace YSocial.Domain.Identities;

public class Account : AggregateRoot<AccountId>, ISoftDeletable
{
    private const int DefaultRefreshTokenExpiryDays = 7;

    #region Properties
    public string Email { get; private set; }
    public PasswordHash PasswordHash { get; private set; }
    public UserRole Role { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsActive { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    private readonly List<RefreshToken> _refreshTokens = [];
    public IReadOnlyCollection<RefreshToken> RefreshTokens => _refreshTokens.AsReadOnly();

    #endregion

    private Account(string email, PasswordHash passwordHash)
    {
        Id = AccountId.New();
        Email = email;
        PasswordHash = passwordHash;
        Role = UserRole.Member;
        CreatedAt = DateTime.UtcNow;
        IsActive = true;
        IsDeleted = false;
    }

    #region Methods
    public static Account Create(string email, PasswordHash passwordHash)
    {
        CheckRule(new EmailMustBeValidRule(email));

        var account = new Account(email, passwordHash);

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
