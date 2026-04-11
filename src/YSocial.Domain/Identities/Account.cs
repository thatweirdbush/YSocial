using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Identities.Events;
using YSocial.Domain.Identities.Rules;

namespace YSocial.Domain.Identities;

public class Account : AggregateRoot<AccountId>
{
    #region Properties
    public string Email { get; private set; }
    public PasswordHash PasswordHash { get; private set; }
    public UserRole Role { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public string? RefreshToken { get; private set; }
    public DateTime? RefreshTokenExpiryTime { get; private set; }
    public bool IsActive { get; private set; }

    #endregion

    private Account(string email, PasswordHash passwordHash)
    {
        Id = AccountId.New();
        Email = email;
        PasswordHash = passwordHash;
        Role = UserRole.Member;
        CreatedAt = DateTime.UtcNow;
        IsActive = true;
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
    }

    public void SetRefreshToken(string token, DateTime expiryTime)
    {
        CheckRule(new RefreshTokenMustBeValidRule(token));
        CheckRule(new RefreshTokenMustNotBeExpiredRule(expiryTime));

        RefreshToken = token;
        RefreshTokenExpiryTime = expiryTime;
    }

    public void RevokeRefreshToken()
    {
        RefreshToken = null;
        RefreshTokenExpiryTime = null;
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

    #endregion
}
