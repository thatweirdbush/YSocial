using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using System.Collections.Concurrent;
using YSocial.Domain.Comments;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure.Data;

public class MockDataStore : DbContext, IDataStorage, IDomainEventsProvider
{
    public static ConcurrentDictionary<AccountId, Account> Accounts { get; set; } = [];
    public static ConcurrentDictionary<UserId, User> Users { get; set; } = [];
    public static ConcurrentDictionary<PostId, Post> Posts { get; set; } = [];
    public static ConcurrentDictionary<LikeId, Like> Likes { get; set; } = [];
    public static ConcurrentDictionary<CommentId, Comment> Comments { get; set; } = [];
    public static ConcurrentDictionary<SavedItemId, SavedItem> SavedItems { get; set; } = [];

    static MockDataStore()
    {
        SeedMockData();
    }

    private static void SeedMockData()
    {
        // 1. Create fake Accounts
        var passwordAdminHash = PasswordHash.Create("admin");
        var passwordHash = PasswordHash.Create("Password123!");
        
        var account1 = Account.Create("test@example.com", "+1234567890", passwordHash);
        var account2 = Account.Create("demo@example.com", "0987654321", passwordHash);
        var accountAdmin = Account.Create("admin@admin.com", null, passwordAdminHash);

        account1.ClearDomainEvents();
        account2.ClearDomainEvents();
        accountAdmin.ClearDomainEvents();

        Accounts.TryAdd(account1.Id, account1);
        Accounts.TryAdd(account2.Id, account2);
        Accounts.TryAdd(accountAdmin.Id, accountAdmin);

        // 2. Create fake Users linked to Accounts
        var user1 = User.Create(account1.Id, "test_user", Country.Vietnam, isDefault: true);
        var user1Alt = User.Create(account1.Id, "test_user_alt", Country.Vietnam, isDefault: false); // Second profile for account1
        var user2 = User.Create(account2.Id, "demo_user", Country.Vietnam, isDefault: true);
        var userAdmin = User.Create(accountAdmin.Id, "admin", Country.Vietnam, isDefault: true);

        user1.ClearDomainEvents();
        user1Alt.ClearDomainEvents();
        user2.ClearDomainEvents();
        userAdmin.ClearDomainEvents();

        Users.TryAdd(user1.Id, user1);
        Users.TryAdd(user1Alt.Id, user1Alt);
        Users.TryAdd(user2.Id, user2);
        Users.TryAdd(userAdmin.Id, userAdmin);

        // 3. Create fake Posts
        var post1 = Post.Create(user1.Id, "Welcome to YSocial!");
        var post2 = Post.Create(user2.Id, "The weather is nice.");

        post1.ClearDomainEvents();
        post2.ClearDomainEvents();

        Posts.TryAdd(post1.Id, post1);
        Posts.TryAdd(post2.Id, post2);
    }

    public void ClearAllDomainEvents()
    {
        foreach (var entry in Accounts.Values) entry.ClearDomainEvents();
        foreach (var entry in Users.Values) entry.ClearDomainEvents();
        foreach (var entry in Posts.Values) entry.ClearDomainEvents();
        foreach (var entry in Likes.Values) entry.ClearDomainEvents();
        foreach (var entry in Comments.Values) entry.ClearDomainEvents();
        foreach (var entry in SavedItems.Values) entry.ClearDomainEvents();
    }

    public IReadOnlyCollection<IDomainEvent> GetAllDomainEvents()
    {
        var events = new List<IDomainEvent>();

        events.AddRange(Accounts.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Users.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Posts.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Likes.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Comments.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(SavedItems.Values.SelectMany(e => e.DomainEvents));

        return events.AsReadOnly();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(1);
    }
}
