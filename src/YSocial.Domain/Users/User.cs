using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Countries;
using YSocial.Domain.Users.Events;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.Users;
public class User : AggregateRoot<UserId>
{
    public string Username { get; private set; }
    public string Email { get; private set; }
    public Country Country { get; private set; }
    public DateTime CreatedAt { get; private set; }

    private User(string username, string email, Country country)
    {
        Id = UserId.New();
        Username = username;
        Email = email;
        Country = country;
        CreatedAt = DateTime.UtcNow;
    }

    public static User Create(string username, string email, Country country)
    {
        CheckRule(new UsernameMustBeMinimumLengthRule(username));
        CheckRule(new EmailMustBeValidRule(email));

        var user = new User(username, email, country);

        user.AddDomainEvent(new UserRegisteredEvent(user.Id, user.Email));

        return user;
    }
}
