using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Users.Events;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.Users;

public class User : AggregateRoot<UserId>, ISoftDeletable
{
    #region Properties
    public string Username { get; private set; }
    public UserProfileInfo ProfileInfo { get; private set; }
    public Country Country { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public DateTime? DeletedAt { get; private set; }
    public AccountId AccountId { get; private set; }
    public bool IsDefault { get; private set; }

    // Stats
    public int FollowersCount { get; private set; }
    public int FollowingCount { get; private set; }

    // Settings
    public PrivacySettings PrivacySettings { get; private set; }
    #endregion

    private User(AccountId accountId, string username, UserProfileInfo profileInfo, Country country, bool isDefault)
    {
        Id = UserId.New();
        AccountId = accountId;
        Username = username;
        ProfileInfo = profileInfo;
        Country = country;
        IsDefault = isDefault;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;

        // Default values
        PrivacySettings = PrivacySettings.Default();
        FollowersCount = 0;
        FollowingCount = 0;
    }

    public static User Create(AccountId accountId, string username, Country country, bool isDefault = false)
    {
        CheckRule(new UsernameMustBeMinimumLengthRule(username));

        // Use username as default display name initially
        var profileInfo = UserProfileInfo.CreateDefault(username);
        var user = new User(accountId, username, profileInfo, country, isDefault);
        
        user.AddDomainEvent(new UserProfileCreatedEvent(user.Id, user.Username));
        return user;
    }

    public void UpdateProfile(UserProfileInfo profileInfo)
    {
        ProfileInfo = profileInfo;
    }

    public void UpdatePrivacySettings(PrivacySettings settings)
    {
        PrivacySettings = settings;
    }

    public void SetAsDefault()
    {
        IsDefault = true;
    }

    public void UnsetAsDefault()
    {
        IsDefault = false;
    }

    public void Delete(bool isAccountDeletion = false)
    {
        if (!isAccountDeletion)
        {
            CheckRule(new CannotDeleteDefaultUserRule(IsDefault));
        }
        
        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
    }
}
