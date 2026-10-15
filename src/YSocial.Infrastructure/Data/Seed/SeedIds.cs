using YSocial.Domain.Identities;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data.Seed;

/// <summary>
/// Fixed ids & credentials of the mock seed (stable across restarts & resets).
/// </summary>
public static class SeedIds
{
    public const string TestPassword = "Password123!";
    public const string AdminPassword = "admin";

    public static readonly DateTime BaseTime = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    public static readonly AccountId TestAccount = new(Guid.Parse("00000000-0000-0000-0000-0000000000a1"));
    public static readonly AccountId DemoAccount = new(Guid.Parse("00000000-0000-0000-0000-0000000000a2"));
    public static readonly AccountId AdminAccount = new(Guid.Parse("00000000-0000-0000-0000-0000000000a3"));

    public static readonly UserId TestUser = new(Guid.Parse("00000000-0000-0000-0000-0000000000b1"));
    public static readonly UserId TestUserAlt = new(Guid.Parse("00000000-0000-0000-0000-0000000000b2"));
    public static readonly UserId DemoUser = new(Guid.Parse("00000000-0000-0000-0000-0000000000b3"));
    public static readonly UserId AdminUser = new(Guid.Parse("00000000-0000-0000-0000-0000000000b4"));

    public static readonly PostId TestPost = new(Guid.Parse("00000000-0000-0000-0000-0000000000c1"));
    public static readonly PostId DemoPost = new(Guid.Parse("00000000-0000-0000-0000-0000000000c2"));
}
