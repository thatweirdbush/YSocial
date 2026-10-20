using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Comments;
using YSocial.Domain.Countries;
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
/// Rich, deterministic demo data for local development: 12 accounts (13 profiles, 2 private), posts with images,
/// threaded comments, likes, saved posts, a follow graph (pending requests, close friends), mutes, blocks & notifications.
/// Every stored counter (likes, saves, followers, following) matches the rows. Every account uses
/// <see cref="SeedIds.TestPassword"/>. Written directly (no events dispatched). Development ONLY.
/// </summary>
public static class DevelopmentSeeder
{
    private sealed record Person(string Username, string DisplayName, string Bio, bool IsPrivate = false);

    private static readonly Person[] People =
    [
        new("an_nguyen", "An Nguyen", "Coffee, code & Saigon rain."),
        new("binh_tran", "Binh Tran", "Street photographer. Hanoi is home."),
        new("chi_le", "Chi Le", "Reading one book a week."),
        new("dung_pham", "Dung Pham", "Backend dev. Opinions on tabs vs spaces."),
        new("em_hoang", "Em Hoang", "Designer who loves zinc grey."),
        new("giang_vu", "Giang Vu", "Trail runner & amateur chef."),
        new("hai_dang", "Hai Dang", "Football, music, repeat."),
        new("lan_bui", "Lan Bui", "Private corner of the internet.", IsPrivate: true),
        new("minh_do", "Minh Do", "Building small things that last."),
        new("ngoc_ly", "Ngoc Ly", "Plants, tea and slow mornings."),
        new("phuc_ho", "Phuc Ho", "Illustrator. Second profile: phuc_ho_art."),
        new("quynh_vo", "Quynh Vo", "Quiet account, close circle only.", IsPrivate: true)
    ];

    private static readonly string[] PostTexts =
    [
        "Sang nay Sai Gon mua, ly ca phe nong la du.",
        "Just shipped a tiny feature and it feels great.",
        "Hom nay chay 10km, chan met nhung vui.",
        "Anyone else think the best ideas come in the shower?",
        "Doc xong mot cuon sach hay, se review som.",
        "Weekend plan: nothing. Absolutely nothing.",
        "Thu nghiem mot cong thuc moi, ket qua bat ngo.",
        "Minimal design is not the absence of detail.",
        "Tram nam co mot lan, hoa no trong vuon nha.",
        "Refactoring day: deleted more code than I wrote.",
        "Pho ben duong van la ngon nhat.",
        "Reminder: take a break, drink some water.",
        "Moi nguoi dang nghe gi hom nay?",
        "Dark mode or light mode? Defend your answer.",
        "Chieu nay troi dep, di dao thoi.",
        "Learning something new every day, even if small.",
        "Ban phim co moi ve, tieng go nghe ghien.",
        "Coffee shop find of the month, quiet and warm.",
        "Mot ngay lam viec hieu qua bat dau tu mot to bun bo.",
        "Tests passing on the first run is suspicious.",
        "Cuoi tuan len Da Lat tron nang.",
        "Small steps are still steps.",
        "Thu viet blog moi tuan, tuan nay la tuan 3.",
        "Rain on the window, playlist on, work done."
    ];

    private static readonly string[] CommentTexts =
    [
        "Hay qua!", "Totally agree.", "Cho minh xin them thong tin nhe.", "Love this.", "Dong y 100%.",
        "Nice one!", "Cam on ban da chia se.", "Haha dung vay.", "Looks great.", "Minh cung nghi vay."
    ];

    private const int PostsPerPerson = 3;

    public static async Task SeedAsync(YSocialDbContext db, CancellationToken cancellationToken = default)
    {
        if (await db.Accounts.AnyAsync(a => a.Id == SeedIds.Account(1), cancellationToken))
        {
            return;
        }

        var accounts = new List<Account>();
        var users = new List<User>();

        BuildPeople(accounts, users);

        // Core profiles already exist: loaded tracked so their follow counters are updated too
        var coreUsers = await db.Users
            .Where(u => u.Id == SeedIds.TestUser || u.Id == SeedIds.DemoUser || u.Id == SeedIds.AdminUser)
            .ToListAsync(cancellationToken);

        var posts = BuildPosts(users);
        var comments = BuildComments(users, posts);
        var likes = BuildLikes(users, posts, comments);
        var saved = BuildSavedItems(users, posts);
        var relations = BuildRelations(users, coreUsers, out var blocks);
        var notifications = BuildNotifications(users, posts, comments, likes, relations);

        db.Accounts.AddRange(accounts);
        db.Users.AddRange(users);
        db.Posts.AddRange(posts);
        db.Comments.AddRange(comments);
        db.Likes.AddRange(likes.Select(l => l.Like));
        db.SavedItems.AddRange(saved);
        db.UserRelations.AddRange(relations);
        db.UserBlocks.AddRange(blocks);
        db.Notifications.AddRange(notifications);

        await db.SaveChangesAsync(cancellationToken);
    }

    #region People

    private static void BuildPeople(List<Account> accounts, List<User> users)
    {
        for (var i = 0; i < People.Length; i++)
        {
            var person = People[i];
            var account = SeedFactory.Pin(
                Account.Create($"{person.Username}@example.com", null, SeedFactory.TestPasswordHash),
                SeedIds.Account(i + 1), SeedIds.BaseTime.AddHours(i));
            accounts.Add(account);

            users.Add(CreateUser(account.Id, person.Username, person.DisplayName, person.Bio, person.IsPrivate, isDefault: true, SeedIds.User(users.Count + 1), i));
        }

        // Second profile on the "phuc_ho" account (profile switcher demo)
        var phuc = accounts[10];
        users.Add(CreateUser(phuc.Id, "phuc_ho_art", "Phuc Ho Art", "Sketches only.", isPrivate: false, isDefault: false, SeedIds.User(users.Count + 1), 10));
    }

    private static User CreateUser(AccountId accountId, string username, string displayName, string bio, bool isPrivate, bool isDefault, UserId id, int index)
    {
        var user = SeedFactory.Pin(User.Create(accountId, username, Country.Vietnam, isDefault), id, SeedIds.BaseTime.AddHours(index));

        user.UpdateProfile(new UserProfileInfo(
            displayName,
            bio,
            $"https://i.pravatar.cc/150?u={username}",
            $"https://picsum.photos/seed/{username}/1200/400",
            index % 2 == 0 ? Gender.Female : Gender.Male,
            new DateTime(1990 + index % 12, 1 + index % 12, 1 + index % 27),
            ProfileType.Personal));

        if (isPrivate)
        {
            user.UpdatePrivacySettings(new PrivacySettings(true, true, true));
        }

        return user;
    }

    #endregion

    #region Content

    private static List<Post> BuildPosts(List<User> users)
    {
        var posts = new List<Post>();

        // Rich users first, then a few extra posts for the core profiles (so the default test login has content too)
        var authors = users.Select(u => u.Id).Concat([SeedIds.TestUser, SeedIds.DemoUser, SeedIds.AdminUser]).ToList();

        // Round-robin over authors (round k, then author a): timelines interleave instead of 1 author owning the newest page
        for (var k = 0; k < PostsPerPerson; k++)
        {
            foreach (var author in authors)
            {
                var n = posts.Count;
                var imageUrl = n % 4 == 0 ? $"https://picsum.photos/seed/ysocial-{n}/800/600" : null;
                var post = Post.Create(author, PostTexts[n % PostTexts.Length], imageUrl);

                posts.Add(SeedFactory.Pin(post, SeedIds.Post(n + 3), SeedIds.BaseTime.AddDays(1).AddMinutes(n * 37)));
            }
        }

        return posts;
    }

    private static List<Comment> BuildComments(List<User> users, List<Post> posts)
    {
        var comments = new List<Comment>();
        var commenters = users.Select(u => u.Id).Concat([SeedIds.TestUser, SeedIds.DemoUser]).ToList();

        for (var p = 0; p < posts.Count; p += 2)
        {
            var post = posts[p];
            var parentAuthor = commenters[(p + 1) % commenters.Count];
            if (parentAuthor == post.AuthorId) parentAuthor = commenters[(p + 2) % commenters.Count];

            var top = SeedFactory.Pin(
                Comment.Create(post.Id, parentAuthor, CommentTexts[p % CommentTexts.Length]),
                SeedIds.Comment(comments.Count + 1), post.CreatedAt.AddMinutes(11));
            comments.Add(top);

            // Every 3rd thread gets an author reply (nested reply demo)
            if (p % 3 == 0)
            {
                var reply = SeedFactory.Pin(
                    Comment.Create(post.Id, post.AuthorId, CommentTexts[(p + 3) % CommentTexts.Length], top.Id),
                    SeedIds.Comment(comments.Count + 1), post.CreatedAt.AddMinutes(25));
                comments.Add(reply);
            }
        }

        return comments;
    }

    private sealed record SeededLike(Like Like, Post? Post, Comment? Comment);

    private static List<SeededLike> BuildLikes(List<User> users, List<Post> posts, List<Comment> comments)
    {
        var likers = users.Select(u => u.Id).Concat([SeedIds.TestUser, SeedIds.DemoUser, SeedIds.AdminUser]).ToList();
        var likes = new List<SeededLike>();

        for (var p = 0; p < posts.Count; p++)
        {
            for (var u = 0; u < likers.Count; u++)
            {
                if ((u * 5 + p * 3) % 7 != 0 || likers[u] == posts[p].AuthorId) continue;

                var like = SeedFactory.Pin(
                    Like.Create(posts[p].Id.Value, LikeTargetType.Post, likers[u], posts[p].AuthorId),
                    SeedIds.Like(likes.Count + 1), posts[p].CreatedAt.AddMinutes(5 + u));
                posts[p].IncrementLikeCount();
                likes.Add(new SeededLike(like, posts[p], null));
            }
        }

        for (var c = 0; c < comments.Count; c += 2)
        {
            var post = posts.First(p => p.Id == comments[c].PostId);
            if (post.AuthorId == comments[c].AuthorId) continue;

            var like = SeedFactory.Pin(
                Like.Create(comments[c].Id.Value, LikeTargetType.Comment, post.AuthorId, comments[c].AuthorId),
                SeedIds.Like(likes.Count + 1), comments[c].CreatedAt.AddMinutes(3));
            comments[c].IncrementLikeCount();
            likes.Add(new SeededLike(like, null, comments[c]));
        }

        return likes;
    }

    private static List<SavedItem> BuildSavedItems(List<User> users, List<Post> posts)
    {
        var savers = users.Select(u => u.Id).Concat([SeedIds.TestUser, SeedIds.DemoUser]).ToList();
        var saved = new List<SavedItem>();

        for (var p = 0; p < posts.Count; p++)
        {
            for (var u = 0; u < savers.Count; u++)
            {
                if ((u + p) % 11 != 0 || savers[u] == posts[p].AuthorId) continue;

                var item = SeedFactory.Pin(
                    SavedItem.Create(posts[p].Id.Value, SavedItemTargetType.Post, savers[u]),
                    SeedIds.SavedItem(saved.Count + 1), posts[p].CreatedAt.AddMinutes(30 + u));
                posts[p].IncrementSavedCount();
                saved.Add(item);
            }
        }

        return saved;
    }

    #endregion

    #region Graph

    private static List<UserRelation> BuildRelations(List<User> users, List<User> coreUsers, out List<UserBlock> blocks)
    {
        var everyone = users.Select(u => u.Id).Concat([SeedIds.TestUser, SeedIds.DemoUser, SeedIds.AdminUser]).ToList();
        var privateIds = users.Where(u => u.PrivacySettings.IsPrivateProfile).Select(u => u.Id).ToHashSet();

        // 2 blocked pairs (no edge between them)
        var blockedPairs = new[] { (everyone[3], everyone[6]), (everyone[2], everyone[9]) };
        bool IsBlockedPair(UserId a, UserId b) => blockedPairs.Any(p => (p.Item1 == a && p.Item2 == b) || (p.Item1 == b && p.Item2 == a));

        blocks = blockedPairs
            .Select((p, i) => SeedFactory.Pin(UserBlock.Create(p.Item1, p.Item2), SeedIds.Block(i + 1), SeedIds.BaseTime.AddDays(2).AddMinutes(i)))
            .ToList();

        var userById = users.Concat(coreUsers).ToDictionary(u => u.Id);
        var relations = new List<UserRelation>();
        var edges = new HashSet<(UserId, UserId)>();

        for (var i = 0; i < everyone.Count; i++)
        {
            foreach (var offset in new[] { 1, 2, 4 })
            {
                var observer = everyone[i];
                var target = everyone[(i + offset) % everyone.Count];

                if (observer == target || IsBlockedPair(observer, target) || !edges.Add((observer, target))) continue;

                var relation = UserRelation.Create(observer, target);
                relation.RequestFollow(privateIds.Contains(target));

                // Half of the requests to private profiles are already accepted
                if (relation.FollowStatus == FollowStatus.Pending && relations.Count % 2 == 0)
                {
                    relation.AcceptFollow();
                }

                SeedFactory.Pin(relation, SeedIds.Relation(relations.Count + 1), SeedIds.BaseTime.AddDays(2).AddMinutes(relations.Count * 3));

                if (relation.FollowStatus == FollowStatus.Accepted)
                {
                    if (userById.TryGetValue(observer, out var observerUser)) observerUser.IncrementFollowing();
                    if (userById.TryGetValue(target, out var targetUser)) targetUser.IncrementFollowers();

                    if (relations.Count % 5 == 0) relation.ToggleCloseFriend(true);
                }

                relations.Add(relation);
            }
        }

        // Mutes: a hidden edge or a flag on an existing one (follow state untouched)
        foreach (var (observer, target, slot) in new[] { (everyone[0], everyone[5], 1), (everyone[1], everyone[9], 2) })
        {
            var existing = relations.FirstOrDefault(r => r.ObserverId == observer && r.TargetId == target);
            if (existing is null)
            {
                existing = SeedFactory.Pin(UserRelation.Create(observer, target), SeedIds.Relation(relations.Count + 1), SeedIds.BaseTime.AddDays(3).AddMinutes(slot));
                relations.Add(existing);
            }

            existing.SetMuted(true);
        }

        foreach (var relation in relations) SeedFactory.Clear(relation);

        return relations;
    }

    #endregion

    #region Notifications

    private static List<Notification> BuildNotifications(
        List<User> users, List<Post> posts, List<Comment> comments, List<SeededLike> likes, List<UserRelation> relations)
    {
        var privateIds = users.Where(u => u.PrivacySettings.IsPrivateProfile).Select(u => u.Id).ToHashSet();
        var names = users.ToDictionary(u => u.Id, u => u.Username);
        names[SeedIds.TestUser] = "test_user";
        names[SeedIds.DemoUser] = "demo_user";
        names[SeedIds.AdminUser] = "admin";

        var notifications = new List<Notification>();

        void Add(UserId recipient, UserId sender, NotificationType type, string title, string content, Guid target, DateTime at)
        {
            if (recipient == sender) return;

            var notification = Notification.Create(recipient, sender, type, title, content, target);
            SeedFactory.Pin(notification, SeedIds.Notification(notifications.Count + 1), at);

            // Older half is already read
            if (notifications.Count % 2 == 0) notification.MarkAsRead(recipient);
            SeedFactory.Clear(notification);

            notifications.Add(notification);
        }

        foreach (var like in likes.Where(l => l.Post is not null))
        {
            Add(like.Post!.AuthorId, like.Like.UserId, NotificationType.NewLike, "New Like",
                $"{names[like.Like.UserId]} liked your post.", like.Post.Id.Value, like.Like.CreatedAt);
        }

        foreach (var comment in comments.Where(c => c.ParentCommentId is null))
        {
            var post = posts.First(p => p.Id == comment.PostId);
            Add(post.AuthorId, comment.AuthorId, NotificationType.NewComment, "New Comment",
                $"{names[comment.AuthorId]} commented on your post.", post.Id.Value, comment.CreatedAt);
        }

        foreach (var relation in relations)
        {
            if (relation.FollowStatus == FollowStatus.Pending)
            {
                Add(relation.TargetId, relation.ObserverId, NotificationType.FollowRequested, "New Follow Request",
                    $"{names[relation.ObserverId]} wants to follow you.", relation.ObserverId.Value, relation.CreatedAt);
            }
            else if (relation.FollowStatus == FollowStatus.Accepted && privateIds.Contains(relation.TargetId))
            {
                Add(relation.ObserverId, relation.TargetId, NotificationType.FollowAccepted, "Follow Request Accepted",
                    $"{names[relation.TargetId]} accepted your follow request.", relation.TargetId.Value, relation.UpdatedAt ?? relation.CreatedAt);
            }
            else if (relation.FollowStatus == FollowStatus.Accepted)
            {
                Add(relation.TargetId, relation.ObserverId, NotificationType.NewFollow, "New Follower",
                    $"{names[relation.ObserverId]} started following you.", relation.ObserverId.Value, relation.CreatedAt);
            }
        }

        return notifications;
    }

    #endregion
}
