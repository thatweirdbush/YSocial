using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Users.Events;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.Users;
public class User : AggregateRoot<UserId>, ISoftDeletable
{
    public string Username { get; private set; }
    public string? Bio { get; private set; }
    public string? AvatarUrl { get; private set; }
    public Country Country { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public bool IsDeleted { get; private set; }
    public AccountId AccountId { get; private set; }
    public bool IsDefault { get; private set; }
    public DateTime? DeletedAt { get; private set; }

    private User(AccountId accountId, string username, Country country, bool isDefault)
    {
        Id = UserId.New();
        AccountId = accountId;
        Username = username;
        Country = country;
        IsDefault = isDefault;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
    }

    public static User Create(AccountId accountId, string username, Country country, bool isDefault = false)
    {
        CheckRule(new UsernameMustBeMinimumLengthRule(username));

        var user = new User(accountId, username, country, isDefault);
        user.AddDomainEvent(new UserProfileCreatedEvent(user.Id, user.Username));
        return user;
    }

    public void UpdateProfile(string? bio, string? avatarUrl)
    {
        Bio = bio;
        AvatarUrl = avatarUrl;
    }

    public void Delete()
    {
        IsDeleted = true;
        DeletedAt = DateTime.UtcNow;
    }
}
