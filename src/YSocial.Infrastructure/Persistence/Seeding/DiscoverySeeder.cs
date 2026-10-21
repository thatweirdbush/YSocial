using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Posts;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Seeding;

/// <summary>
/// Stage 2 of the development dataset (discovery data), additive & idempotent: sentinel = account <c>Account(100)</c>.
/// Runs on fresh AND already-seeded databases: removes the legacy stock image URLs of stage 1 (seed rows only, exact patterns),
/// then adds 18 profiles (3 private), tagged posts spread over 12 days (trending), likes and a follow graph with
/// mutuals (suggestions). Counters stay equal to rows. Development ONLY.
/// </summary>
internal static partial class DiscoverySeeder
{
    private const int FirstIndex = 100;
    private const int TaggedPosts = 72;
    private const int SeedDays = 12;

    private sealed record Person(string Username, string DisplayName, string Bio, bool IsPrivate = false);

    private static readonly Person[] People =
    [
        new("thao_nguyen", "Thao Nguyen", "Saigon streets, coffee and film."),
        new("khoa_le", "Khoa Le", "Frontend dev. Ships on Fridays."),
        new("mai_anh", "Mai Anh", "Weekend trips to Da Lat."),
        new("tuan_kiet", "Tuan Kiet", "Runner. Slow but steady."),
        new("bao_chau", "Bao Chau", "Minimal design, maximal tea."),
        new("duc_manh", "Duc Manh", "Backend & coffee."),
        new("hoai_thu", "Hoai Thu", "Food diary."),
        new("gia_han", "Gia Han", "Rainy day playlists."),
        new("quang_vinh", "Quang Vinh", "Open source tinkerer."),
        new("thanh_tam", "Thanh Tam", "Private notes.", IsPrivate: true),
        new("yen_nhi", "Yen Nhi", "Illustration & ink."),
        new("trung_hieu", "Trung Hieu", "Marathon in progress."),
        new("kim_ngan", "Kim Ngan", "Close circle only.", IsPrivate: true),
        new("anh_khoa", "Anh Khoa", "Photos from the road."),
        new("bich_phuong", "Bich Phuong", "Books and bun bo."),
        new("minh_chau", "Minh Chau", "Design systems."),
        new("dang_khoi", "Dang Khoi", "Private, for friends.", IsPrivate: true),
        new("lan_huong", "Lan Huong", "Garden, tea, quiet mornings.")
    ];

    // Display casing, weight: uneven popularity so the top of the trending list is stable
    private static readonly (string Tag, int Weight)[] Topics =
    [
        ("SaiGon", 14), ("ĐàLạt", 11), ("cafe", 9), ("code", 8), ("running", 6), ("MinimalDesign", 5), ("bunbo", 4), ("rainyday", 3)
    ];

    private static readonly string[] Phrases =
    [
        "Hom nay that dep",
        "Chia se mot khoanh khac nho",
        "Small win of the day",
        "Cuoi tuan nay co ai di khong",
        "Found a quiet corner",
        "Worth the trip",
        "Moi thu deu on",
        "Notes to self"
    ];

    // Exact stage 1 stock patterns (seed rows only)
    [GeneratedRegex(@"^https://picsum\.photos/seed/ysocial-\d+/800/600$")]
    private static partial Regex StockPostImage();

    public static async Task SeedAsync(YSocialDbContext db, CancellationToken cancellationToken = default)
    {
        if (await db.Accounts.AnyAsync(a => a.Id == SeedIds.Account(FirstIndex), cancellationToken))
        {
            return;
        }

        var oldUsers = await db.Users
            .Where(u => SeedUserIds.Contains(u.Id))
            .ToListAsync(cancellationToken);

        await RemoveStockImagesAsync(db, oldUsers, cancellationToken);

        var now = DateTime.UtcNow;
        var accounts = new List<Account>();
        var users = new List<User>();
        BuildPeople(accounts, users);

        var userById = users.Concat(oldUsers).ToDictionary(u => u.Id);
        var authors = users.Select(u => u.Id).Concat(oldUsers.Take(12).Select(u => u.Id)).ToList();
        var posts = BuildPosts(authors, now);
        var likes = BuildLikes(users.Concat(oldUsers).Select(u => u.Id).ToList(), posts);
        var relations = BuildRelations(users, oldUsers, userById, now);

        db.Accounts.AddRange(accounts);
        db.Users.AddRange(users);
        db.Posts.AddRange(posts);
        db.Likes.AddRange(likes);
        db.UserRelations.AddRange(relations);

        await db.SaveChangesAsync(cancellationToken);
    }

    private static readonly List<UserId> SeedUserIds = Enumerable.Range(1, 13).Select(SeedIds.User).ToList();

    #region Stock cleanup

    // Only rows with a seed id AND an exact stage 1 stock URL: user edits and non-seed rows are never touched
    private static async Task RemoveStockImagesAsync(YSocialDbContext db, List<User> seedUsers, CancellationToken cancellationToken)
    {
        foreach (var user in seedUsers)
        {
            var info = user.ProfileInfo;
            var avatarIsStock = info.AvatarUrl == $"https://i.pravatar.cc/150?u={user.Username}";
            var coverIsStock = info.CoverUrl == $"https://picsum.photos/seed/{user.Username}/1200/400";
            if (!avatarIsStock && !coverIsStock) continue;

            user.UpdateProfile(new UserProfileInfo(
                info.DisplayName, info.Bio,
                avatarIsStock ? null : info.AvatarUrl,
                coverIsStock ? null : info.CoverUrl,
                info.Gender, info.DateOfBirth, info.ProfileType));
        }

        var seedPostPrefix = $"{Guid.Empty.ToString()[..19]}0003-";
        var withImage = await db.Posts.Where(p => p.ImageUrl != null).ToListAsync(cancellationToken);
        foreach (var post in withImage.Where(p => p.Id.Value.ToString().StartsWith(seedPostPrefix, StringComparison.Ordinal) && StockPostImage().IsMatch(p.ImageUrl!)))
        {
            db.Entry(post).Property(p => p.ImageUrl).CurrentValue = null;
        }
    }

    #endregion

    #region Build

    private static void BuildPeople(List<Account> accounts, List<User> users)
    {
        for (var i = 0; i < People.Length; i++)
        {
            var person = People[i];
            var account = SeedFactory.Pin(
                Account.Create($"{person.Username}@example.com", null, SeedFactory.TestPasswordHash),
                SeedIds.Account(FirstIndex + i), SeedIds.BaseTime.AddDays(3).AddHours(i));
            accounts.Add(account);

            users.Add(DevelopmentSeeder.CreateUser(
                account.Id, person.Username, person.DisplayName, person.Bio, person.IsPrivate, isDefault: true, SeedIds.User(FirstIndex + i), i));
        }
    }

    private static List<Post> BuildPosts(List<UserId> authors, DateTime now)
    {
        var schedule = Topics.SelectMany(t => Enumerable.Repeat(t.Tag, t.Weight)).ToList();
        var posts = new List<Post>();

        for (var n = 0; n < TaggedPosts; n++)
        {
            var primary = Casing(schedule[n % schedule.Count], n);
            var content = $"{Phrases[n % Phrases.Length]} #{primary}";

            // Every 3rd post carries a second, different topic
            var secondary = Casing(schedule[(n * 7 + 3) % schedule.Count], n + 1);
            if (n % 3 == 0 && !string.Equals(HashtagParser.Fold(secondary), HashtagParser.Fold(primary), StringComparison.Ordinal))
            {
                content += $" #{secondary}";
            }

            var createdAt = now.AddDays(-(n % SeedDays)).AddMinutes(-(n * 13 % 600));
            posts.Add(SeedFactory.Pin(Post.Create(authors[n % authors.Count], content), SeedIds.Post(1000 + n), createdAt));
        }

        return posts;
    }

    // Folded-equal variants exercise casing votes (most used casing wins)
    private static string Casing(string tag, int n) => tag switch
    {
        "SaiGon" when n % 5 == 0 => "saigon",
        "ĐàLạt" when n % 4 == 0 => "dalat",
        _ => tag
    };

    private static List<Like> BuildLikes(List<UserId> likers, List<Post> posts)
    {
        var likes = new List<Like>();

        for (var p = 0; p < posts.Count; p++)
        {
            for (var u = 0; u < likers.Count; u++)
            {
                if ((u * 5 + p * 3) % 7 != 0 || likers[u] == posts[p].AuthorId) continue;

                var like = SeedFactory.Pin(
                    Like.Create(posts[p].Id.Value, LikeTargetType.Post, likers[u], posts[p].AuthorId),
                    SeedIds.Like(1000 + likes.Count), posts[p].CreatedAt.AddMinutes(5 + u));
                posts[p].IncrementLikeCount();
                likes.Add(like);
            }
        }

        return likes;
    }

    private static List<UserRelation> BuildRelations(
        List<User> users, List<User> oldUsers, Dictionary<UserId, User> userById, DateTime now)
    {
        var privateIds = users.Where(u => u.PrivacySettings.IsPrivateProfile).Select(u => u.Id).ToHashSet();
        var relations = new List<UserRelation>();
        var edges = new HashSet<(UserId, UserId)>();

        void Follow(UserId observer, UserId target)
        {
            if (observer == target || !edges.Add((observer, target))) return;

            var relation = UserRelation.Create(observer, target);
            relation.RequestFollow(privateIds.Contains(target));

            // Every 2nd request to a private profile is already accepted
            if (relation.FollowStatus == FollowStatus.Pending && relations.Count % 2 == 0)
            {
                relation.AcceptFollow();
            }

            SeedFactory.Pin(relation, SeedIds.Relation(1000 + relations.Count), now.AddDays(-SeedDays).AddMinutes(relations.Count * 3));

            if (relation.FollowStatus == FollowStatus.Accepted)
            {
                if (userById.TryGetValue(observer, out var observerUser)) observerUser.IncrementFollowing();
                if (userById.TryGetValue(target, out var targetUser)) targetUser.IncrementFollowers();
            }

            relations.Add(relation);
        }

        var popular = users.Take(4).Select(u => u.Id).ToList();

        for (var i = 0; i < users.Count; i++)
        {
            var me = users[i].Id;

            // Ring edges create friends-of-friends (mutuals)
            foreach (var offset in new[] { 1, 3, 5 }) Follow(me, users[(i + offset) % users.Count].Id);

            if (i % 2 == 0) foreach (var star in popular) Follow(me, star);

            if (oldUsers.Count > 0 && i % 3 == 0) Follow(me, oldUsers[i % oldUsers.Count].Id);
            if (oldUsers.Count > 0 && i % 4 == 0) Follow(oldUsers[(i + 2) % oldUsers.Count].Id, me);
        }

        return relations;
    }

    #endregion
}
