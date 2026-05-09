using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Countries;
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
    public DateTime? DeletedAt { get; private set; }

    private User(string username, Country country)
    {
        Id = UserId.New();
        Username = username;
        Country = country;
        CreatedAt = DateTime.UtcNow;
        IsDeleted = false;
    }

    public static User Create(string username, Country country)
    {
        CheckRule(new UsernameMustBeMinimumLengthRule(username));

        var user = new User(username, country);
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
