using YSocial.Domain.Comments;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Seeding;

/// <summary>
/// Fixed ids & credentials of the seed data (stable across restarts, resets & environments).
/// <para/>
/// Core seed (<see cref="CoreSeeder"/>, test baseline) uses the named ids; the development dataset
/// (<see cref="DevelopmentSeeder"/>) derives its ids from <c>Account(n)</c>, <c>User(n)</c>... (n = 1-based index).
/// </summary>
public static class SeedIds
{
    public const string TestPassword = "Password123!";
    public const string AdminPassword = "admin";

    public static readonly DateTime BaseTime = new(2026, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    #region Core

    public static readonly AccountId TestAccount = new(Guid.Parse("00000000-0000-0000-0000-0000000000a1"));
    public static readonly AccountId DemoAccount = new(Guid.Parse("00000000-0000-0000-0000-0000000000a2"));
    public static readonly AccountId AdminAccount = new(Guid.Parse("00000000-0000-0000-0000-0000000000a3"));

    public static readonly UserId TestUser = new(Guid.Parse("00000000-0000-0000-0000-0000000000b1"));
    public static readonly UserId TestUserAlt = new(Guid.Parse("00000000-0000-0000-0000-0000000000b2"));
    public static readonly UserId DemoUser = new(Guid.Parse("00000000-0000-0000-0000-0000000000b3"));
    public static readonly UserId AdminUser = new(Guid.Parse("00000000-0000-0000-0000-0000000000b4"));

    public static readonly PostId TestPost = new(Guid.Parse("00000000-0000-0000-0000-0000000000c1"));
    public static readonly PostId DemoPost = new(Guid.Parse("00000000-0000-0000-0000-0000000000c2"));

    #endregion

    #region Development dataset

    public static AccountId Account(int n) => new(Make(1, n));
    public static UserId User(int n) => new(Make(2, n));
    public static PostId Post(int n) => new(Make(3, n));
    public static CommentId Comment(int n) => new(Make(4, n));
    public static LikeId Like(int n) => new(Make(5, n));
    public static SavedItemId SavedItem(int n) => new(Make(6, n));
    public static UserRelationId Relation(int n) => new(Make(7, n));
    public static UserBlockId Block(int n) => new(Make(8, n));
    public static NotificationId Notification(int n) => new(Make(9, n));

    private static Guid Make(int kind, int n) => Guid.Parse($"00000000-0000-0000-{kind:x4}-{n:x12}");

    #endregion
}
