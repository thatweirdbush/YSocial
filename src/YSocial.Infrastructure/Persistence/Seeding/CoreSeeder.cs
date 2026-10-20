using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Seeding;

/// <summary>
/// Minimal deterministic baseline (3 accounts, 4 profiles, 2 posts). Integration tests start from exactly this.
/// Well-known passwords: never seed it outside Development & tests.
/// </summary>
public static class CoreSeeder
{
    /// <summary>
    /// Idempotent: does nothing when the baseline is already there.
    /// </summary>
    public static async Task SeedAsync(YSocialDbContext db, CancellationToken cancellationToken = default)
    {
        if (await db.Accounts.AnyAsync(a => a.Id == SeedIds.TestAccount, cancellationToken))
        {
            return;
        }

        var accountTest = SeedFactory.Pin(Account.Create("test@example.com", "+1234567890", SeedFactory.TestPasswordHash), SeedIds.TestAccount, At(0));
        var accountDemo = SeedFactory.Pin(Account.Create("demo@example.com", "0987654321", SeedFactory.TestPasswordHash), SeedIds.DemoAccount, At(1));
        var accountAdmin = SeedFactory.Pin(Account.Create("admin@admin.com", null, SeedFactory.AdminPasswordHash), SeedIds.AdminAccount, At(2));

        var userTest = SeedFactory.Pin(User.Create(accountTest.Id, "test_user", Country.Vietnam, isDefault: true), SeedIds.TestUser, At(0));
        var userTestAlt = SeedFactory.Pin(User.Create(accountTest.Id, "test_user_alt", Country.Vietnam, isDefault: false), SeedIds.TestUserAlt, At(1));
        var userDemo = SeedFactory.Pin(User.Create(accountDemo.Id, "demo_user", Country.Vietnam, isDefault: true), SeedIds.DemoUser, At(2));
        var userAdmin = SeedFactory.Pin(User.Create(accountAdmin.Id, "admin", Country.Vietnam, isDefault: true), SeedIds.AdminUser, At(3));

        var postTest = SeedFactory.Pin(Post.Create(userTest.Id, "Welcome to YSocial!"), SeedIds.TestPost, At(10));
        var postDemo = SeedFactory.Pin(Post.Create(userDemo.Id, "The weather is nice."), SeedIds.DemoPost, At(11));

        db.Accounts.AddRange(accountTest, accountDemo, accountAdmin);
        db.Users.AddRange(userTest, userTestAlt, userDemo, userAdmin);
        db.Posts.AddRange(postTest, postDemo);

        await db.SaveChangesAsync(cancellationToken);
    }

    private static DateTime At(int minutes) => SeedIds.BaseTime.AddMinutes(minutes);
}
