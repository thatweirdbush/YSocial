using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Posts;

public class PostListTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static string UserPosts(Guid userId, string query = "") => $"/api/posts/user/{userId}{query}";

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static async Task<Guid> CreatePostAsync(HttpClient client, string content)
    {
        var response = await client.PostAsJsonAsync("/api/posts", new { content });
        response.EnsureSuccessStatusCode();
        return (await JsonAsync(response)).GetProperty("id").GetGuid();
    }

    private static IReadOnlyList<string> Contents(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("content").GetString()!).ToList();

    private static void MakePrivate(UserId id) => Store.Users.Update(id, x => x.UpdatePrivacySettings(new PrivacySettings(true, true, true)));

    #region User posts

    [Fact]
    public async Task UserPosts_Envelope_HasPagedResponseFieldsAndLocked()
    {
        var body = await JsonAsync(await Client.GetAsync(UserPosts(SeedIds.TestUser.Value)));

        body.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(["items", "page", "pageSize", "totalCount", "hasNextPage", "locked"]);
        body.GetProperty("locked").GetBoolean().Should().BeFalse();
        body.GetProperty("pageSize").GetInt32().Should().Be(10);
        Contents(body).Should().Equal("Welcome to YSocial!");
    }

    [Fact]
    public async Task UserPosts_PrivateNonFollower_LockedEmpty()
    {
        MakePrivate(SeedIds.TestUser);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");

        foreach (var client in new[] { Client, admin })
        {
            var response = await client.GetAsync(UserPosts(SeedIds.TestUser.Value));

            response.StatusCode.Should().Be(HttpStatusCode.OK);
            var body = await JsonAsync(response);
            body.GetProperty("locked").GetBoolean().Should().BeTrue();
            body.GetProperty("items").GetArrayLength().Should().Be(0);
            body.GetProperty("totalCount").GetInt32().Should().Be(0);
            body.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
        }
    }

    [Fact]
    public async Task UserPosts_PrivateAcceptedFollower_Unlocked()
    {
        MakePrivate(SeedIds.TestUser);
        var demo = await LoginAsync(Seed.DemoLogin);
        await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null);
        Store.UserRelations.UpdateSingle(x => x.AcceptFollow());

        var body = await JsonAsync(await demo.GetAsync(UserPosts(SeedIds.TestUser.Value)));

        body.GetProperty("locked").GetBoolean().Should().BeFalse();
        body.GetProperty("totalCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task UserPosts_Owner_SeesAll()
    {
        MakePrivate(SeedIds.TestUser);
        var test = await LoginAsync(Seed.TestLogin);
        var privatePost = await CreatePostAsync(test, "private one");
        Store.Posts.Update(new PostId(privatePost), x => x.UpdateSettings(PostVisibility.Private, true));

        var body = await JsonAsync(await test.GetAsync(UserPosts(SeedIds.TestUser.Value)));

        body.GetProperty("locked").GetBoolean().Should().BeFalse();
        Contents(body).Should().BeEquivalentTo(["private one", "Welcome to YSocial!"]);
    }

    [Fact]
    public async Task UserPosts_BlockedEitherWay_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null);

        (await test.GetAsync(UserPosts(SeedIds.DemoUser.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await demo.GetAsync(UserPosts(SeedIds.TestUser.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task UserPosts_UnknownOrDeletedUser_404()
    {
        Store.Users.Update(SeedIds.TestUserAlt, x => x.Delete(isAccountDeletion: true));

        (await Client.GetAsync(UserPosts(Guid.NewGuid()))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Client.GetAsync(UserPosts(SeedIds.TestUserAlt.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task UserPosts_TotalCountAfterFilter()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var followersOnly = await CreatePostAsync(test, "followers only");
        var hidden = await CreatePostAsync(test, "private");
        await CreatePostAsync(test, "public two");
        Store.Posts.Update(new PostId(followersOnly), x => x.UpdateSettings(PostVisibility.FollowersOnly, true));
        Store.Posts.Update(new PostId(hidden), x => x.UpdateSettings(PostVisibility.Private, true));

        var visitor = await JsonAsync(await Client.GetAsync(UserPosts(SeedIds.TestUser.Value)));
        var owner = await JsonAsync(await test.GetAsync(UserPosts(SeedIds.TestUser.Value)));

        visitor.GetProperty("totalCount").GetInt32().Should().Be(2, "hidden posts are not counted");
        Contents(visitor).Should().Equal("public two", "Welcome to YSocial!");
        owner.GetProperty("totalCount").GetInt32().Should().Be(4);
    }

    [Fact]
    public async Task UserPosts_PagingAfterFilter_HasNextPageIsExact()
    {
        var test = await LoginAsync(Seed.TestLogin);
        for (var i = 1; i <= 4; i++) await CreatePostAsync(test, $"post {i}");
        var hidden = await CreatePostAsync(test, "hidden newest");
        Store.Posts.Update(new PostId(hidden), x => x.UpdateSettings(PostVisibility.Private, true));

        var first = await JsonAsync(await Client.GetAsync(UserPosts(SeedIds.TestUser.Value, "?page=1&pageSize=2")));
        var last = await JsonAsync(await Client.GetAsync(UserPosts(SeedIds.TestUser.Value, "?page=3&pageSize=2")));

        Contents(first).Should().Equal("post 4", "post 3");
        first.GetProperty("totalCount").GetInt32().Should().Be(5);
        first.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        Contents(last).Should().Equal("Welcome to YSocial!");
        last.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task UserPosts_BeyondLastPage_EmptyWithMetadata()
    {
        var body = await JsonAsync(await Client.GetAsync(UserPosts(SeedIds.TestUser.Value, "?page=9&pageSize=5")));

        body.GetProperty("items").GetArrayLength().Should().Be(0);
        body.GetProperty("totalCount").GetInt32().Should().Be(1);
        body.GetProperty("page").GetInt32().Should().Be(9);
        body.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
        body.GetProperty("locked").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task UserPosts_ViewerFlags_AreProjected()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        await demo.PutAsync($"/api/posts/{SeedIds.TestPost.Value}/like", null);

        var body = await JsonAsync(await demo.GetAsync(UserPosts(SeedIds.TestUser.Value)));

        body.GetProperty("items")[0].GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeTrue();
        body.GetProperty("items")[0].GetProperty("likesCount").GetInt32().Should().Be(1);
    }

    #endregion

    #region Saved posts

    [Fact]
    public async Task SavedPosts_Anonymous_401()
    {
        (await Client.GetAsync("/api/saveditems/posts")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task SavedPosts_Paged_NewestSavedFirst()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var ids = new List<Guid>();
        for (var i = 1; i <= 3; i++) ids.Add(await CreatePostAsync(demo, $"demo post {i}"));
        foreach (var id in new[] { ids[1], ids[0], ids[2] })
        {
            (await test.PutAsync($"/api/posts/{id}/bookmark", null)).EnsureSuccessStatusCode();
            await Task.Delay(5);
        }

        var first = await JsonAsync(await test.GetAsync("/api/saveditems/posts?page=1&pageSize=2"));
        var second = await JsonAsync(await test.GetAsync("/api/saveditems/posts?page=2&pageSize=2"));

        Contents(first).Should().Equal("demo post 3", "demo post 1");
        first.GetProperty("totalCount").GetInt32().Should().Be(3);
        first.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        Contents(second).Should().Equal("demo post 2");
        second.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
        first.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(["items", "page", "pageSize", "totalCount", "hasNextPage"]);
        first.GetProperty("items")[0].GetProperty("isBookmarkedByCurrentUser").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task SavedPosts_InvalidPaging_400()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.GetAsync("/api/saveditems/posts?pageSize=51")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await test.GetAsync("/api/saveditems/posts?page=0")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task SavedPosts_ExcludesDeletedHiddenBlocked_BeforePaging()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var deleted = await CreatePostAsync(demo, "deleted");
        var hidden = await CreatePostAsync(demo, "hidden");
        var visible = await CreatePostAsync(demo, "visible");
        var blockedAuthor = await CreatePostAsync(admin, "from blocked");
        foreach (var id in new[] { deleted, hidden, visible, blockedAuthor }) await test.PutAsync($"/api/posts/{id}/bookmark", null);
        await demo.DeleteAsync($"/api/posts/{deleted}");
        Store.Posts.Update(new PostId(hidden), x => x.UpdateSettings(PostVisibility.Private, true));
        await test.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null);

        var body = await JsonAsync(await test.GetAsync("/api/saveditems/posts?page=1&pageSize=1"));

        Contents(body).Should().Equal("visible");
        body.GetProperty("totalCount").GetInt32().Should().Be(1, "inaccessible posts are not counted");
        body.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task SavedPosts_AuthorWentPrivate_NonFollower_Excluded()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync($"/api/posts/{SeedIds.DemoPost.Value}/bookmark", null);
        (await JsonAsync(await test.GetAsync("/api/saveditems/posts"))).GetProperty("totalCount").GetInt32().Should().Be(1);

        MakePrivate(SeedIds.DemoUser);

        var body = await JsonAsync(await test.GetAsync("/api/saveditems/posts"));
        body.GetProperty("totalCount").GetInt32().Should().Be(0);
        body.GetProperty("items").GetArrayLength().Should().Be(0);
    }

    [Fact]
    public async Task SavedPosts_OwnPostsAlwaysVisible_EvenWhenPrivate()
    {
        MakePrivate(SeedIds.TestUser);
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync($"/api/posts/{SeedIds.TestPost.Value}/bookmark", null);

        var body = await JsonAsync(await test.GetAsync("/api/saveditems/posts"));

        Contents(body).Should().Equal("Welcome to YSocial!");
    }

    [Fact]
    public async Task SavedPosts_IgnoresSavedComments()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var added = await test.PostAsJsonAsync("/api/comments", new { postId = SeedIds.DemoPost.Value, content = "c", parentCommentId = (Guid?)null });
        added.EnsureSuccessStatusCode();
        var commentId = Store.Comments.Values.Single().Id.Value;
        (await test.PutAsync($"/api/comments/{commentId}/bookmark", null)).EnsureSuccessStatusCode();

        var body = await JsonAsync(await test.GetAsync("/api/saveditems/posts"));

        body.GetProperty("totalCount").GetInt32().Should().Be(0);
    }

    #endregion
}
