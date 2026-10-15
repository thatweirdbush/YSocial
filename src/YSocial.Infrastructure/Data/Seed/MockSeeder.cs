using System.Reflection;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Identity;

namespace YSocial.Infrastructure.Data.Seed;

/// <summary>
/// Populates <see cref="MockDataStore"/> with the deterministic seed.
/// Reflection on private setters is allowed ONLY here.
/// </summary>
internal static class MockSeeder
{
    // bcrypt is slow: hash once per process
    private static readonly Lazy<PasswordHash> TestHash = new(() => PasswordHash.Create(new BCryptPasswordHasher().Hash(SeedIds.TestPassword)));
    private static readonly Lazy<PasswordHash> AdminHash = new(() => PasswordHash.Create(new BCryptPasswordHasher().Hash(SeedIds.AdminPassword)));

    public static void Seed()
    {
        // 1. Accounts
        var account1 = Account.Create("test@example.com", "+1234567890", TestHash.Value);
        var account2 = Account.Create("demo@example.com", "0987654321", TestHash.Value);
        var accountAdmin = Account.Create("admin@admin.com", null, AdminHash.Value);

        Fix(account1, SeedIds.TestAccount.Value, 0);
        Fix(account2, SeedIds.DemoAccount.Value, 1);
        Fix(accountAdmin, SeedIds.AdminAccount.Value, 2);

        MockDataStore.Accounts.TryAdd(account1.Id, account1);
        MockDataStore.Accounts.TryAdd(account2.Id, account2);
        MockDataStore.Accounts.TryAdd(accountAdmin.Id, accountAdmin);

        // 2. Users
        var user1 = User.Create(account1.Id, "test_user", Country.Vietnam, isDefault: true);
        var user1Alt = User.Create(account1.Id, "test_user_alt", Country.Vietnam, isDefault: false);
        var user2 = User.Create(account2.Id, "demo_user", Country.Vietnam, isDefault: true);
        var userAdmin = User.Create(accountAdmin.Id, "admin", Country.Vietnam, isDefault: true);

        Fix(user1, SeedIds.TestUser.Value, 0);
        Fix(user1Alt, SeedIds.TestUserAlt.Value, 1);
        Fix(user2, SeedIds.DemoUser.Value, 2);
        Fix(userAdmin, SeedIds.AdminUser.Value, 3);

        MockDataStore.Users.TryAdd(user1.Id, user1);
        MockDataStore.Users.TryAdd(user1Alt.Id, user1Alt);
        MockDataStore.Users.TryAdd(user2.Id, user2);
        MockDataStore.Users.TryAdd(userAdmin.Id, userAdmin);

        // 3. Posts
        var post1 = Post.Create(user1.Id, "Welcome to YSocial!");
        var post2 = Post.Create(user2.Id, "The weather is nice.");

        Fix(post1, SeedIds.TestPost.Value, 10);
        Fix(post2, SeedIds.DemoPost.Value, 11);

        MockDataStore.Posts.TryAdd(post1.Id, post1);
        MockDataStore.Posts.TryAdd(post2.Id, post2);
    }

    private static void Fix(object entity, Guid id, int minuteOffset)
    {
        var idProperty = entity.GetType().GetProperty("Id", BindingFlags.Instance | BindingFlags.Public)!;
        var idType = idProperty.PropertyType;
        idProperty.GetSetMethod(true)!.Invoke(entity, [Activator.CreateInstance(idType, id)]);

        entity.GetType().GetProperty("CreatedAt", BindingFlags.Instance | BindingFlags.Public)!
            .GetSetMethod(true)!.Invoke(entity, [SeedIds.BaseTime.AddMinutes(minuteOffset)]);

        ((dynamic)entity).ClearDomainEvents();
    }
}
