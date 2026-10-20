using System.Net;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Feed;

public class FeedTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly Guid Demo = SeedIds.DemoUser.Value;

    private static IReadOnlyList<string> Contents(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("content").GetString()!).ToList();

    private static async Task<Guid> PostAsync(HttpClient client, string content)
    {
        var id = await client.CreatePostAsync(content);
        await Task.Delay(5);
        return id;
    }

    private static string FollowRoute(Guid id) => $"/api/users/{id}/relations/follow";

    private static void MakePrivate(UserId id) => Store.Users.Update(id, x => x.UpdatePrivacySettings(new PrivacySettings(true, true, true)));

    [Fact]
    public async Task Feed_Following_OnlyAcceptedAndSelf()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        await test.PostAsync(FollowRoute(Demo), null);
        await PostAsync(demo, "demo-post");
        await PostAsync(admin, "admin-post");
        await PostAsync(test, "own-post");

        var feed = await (await test.GetAsync("/api/feed?tab=following")).ReadJsonAsync();

        Contents(feed).Should().Equal("own-post", "demo-post", "The weather is nice.", "Welcome to YSocial!");
    }

    [Fact]
    public async Task Feed_Following_ExcludesPendingFollowees()
    {
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        await test.PostAsync(FollowRoute(Demo), null);
        await PostAsync(demo, "demo-post");

        var feed = await (await test.GetAsync("/api/feed?tab=following")).ReadJsonAsync();

        Contents(feed).Should().Equal(["Welcome to YSocial!"]);
    }

    [Fact]
    public async Task Feed_ForYou_ExcludesHiddenBlockedDeletedAndPrivate()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        await PostAsync(demo, "blocked-author-post");
        await PostAsync(admin, "visible-admin-post");
        var deleted = await PostAsync(admin, "deleted-post");
        await admin.DeleteAsync($"/api/posts/{deleted}");
        await test.PostAsync($"/api/users/{Demo}/blocks", null);
        MakePrivate(SeedIds.AdminUser);
        var privateAuthor = StoreData.AddUser("private_author");
        MakePrivate(privateAuthor.Id);

        var feed = await (await test.GetAsync("/api/feed?tab=forYou")).ReadJsonAsync();

        Contents(feed).Should().Equal(["Welcome to YSocial!"], "demo is blocked, admin went private, deleted is gone");
    }

    [Fact]
    public async Task Feed_ForYou_Anonymous_Allowed_DefaultTab()
    {
        var response = await Client.GetAsync("/api/feed");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        Contents(await response.ReadJsonAsync()).Should().HaveCount(2);
    }

    [Fact]
    public async Task Feed_Following_Anonymous_401()
    {
        var response = await Client.GetAsync("/api/feed?tab=following");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("Unauthenticated");
    }

    [Fact]
    public async Task Feed_NewestFirst_Paged_TotalAfterFilter()
    {
        var test = await LoginAsync(Seed.TestLogin);
        foreach (var i in Enumerable.Range(1, 12))
        {
            await PostAsync(test, $"p{i}");
        }

        var first = await (await test.GetAsync("/api/feed?tab=forYou")).ReadJsonAsync();
        var second = await (await test.GetAsync("/api/feed?tab=forYou&page=2")).ReadJsonAsync();
        var beyond = await (await test.GetAsync("/api/feed?tab=forYou&page=9")).ReadJsonAsync();

        Contents(first).Should().Equal(Enumerable.Range(0, 10).Select(i => $"p{12 - i}"));
        first.GetProperty("totalCount").GetInt32().Should().Be(14);
        first.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        Contents(second).Should().HaveCount(4);
        second.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
        Contents(beyond).Should().BeEmpty();
        beyond.GetProperty("totalCount").GetInt32().Should().Be(14);
    }

    [Fact]
    public async Task Feed_ExcludesMutedAuthors_IncludingDormantMute()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        await test.PostAsync(FollowRoute(Demo), null);
        await PostAsync(demo, "demo-post");

        await test.PutAsync($"/api/users/{Demo}/relations/mute", null);
        var muted = await (await test.GetAsync("/api/feed?tab=following")).ReadJsonAsync();
        var mutedForYou = await (await test.GetAsync("/api/feed?tab=forYou")).ReadJsonAsync();
        await test.DeleteAsync(FollowRoute(Demo));
        var dormant = await (await test.GetAsync("/api/feed?tab=forYou")).ReadJsonAsync();

        Contents(muted).Should().Equal("Welcome to YSocial!");
        Contents(mutedForYou).Should().NotContain("demo-post");
        Contents(dormant).Should().NotContain("demo-post", "the mute flag survives unfollow");
    }

    [Fact]
    public async Task Feed_ItemsAreRootPostsOnly_WithViewerFlags()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var post = await PostAsync(test, "root");
        await test.AddCommentAsync(post, "reply");
        await test.PutAsync($"/api/posts/{post}/like", null);

        var feed = await (await test.GetAsync("/api/feed?tab=forYou")).ReadJsonAsync();

        var item = feed.GetProperty("items").EnumerateArray().First(i => i.GetProperty("id").GetGuid() == post);
        feed.GetProperty("items").EnumerateArray().Should().OnlyContain(i => i.GetProperty("kind").GetString() == "post");
        item.GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeTrue();
        item.GetProperty("commentsCount").GetInt32().Should().Be(1);
    }

    [Theory]
    [InlineData("/api/feed?tab=nope")]
    [InlineData("/api/feed?page=0")]
    [InlineData("/api/feed?pageSize=51")]
    [InlineData("/api/feed?pageSize=0")]
    public async Task Feed_InvalidInput_400(string url)
    {
        var response = await Client.GetAsync(url);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("ValidationFailed");
    }
}
