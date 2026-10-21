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

namespace YSocial.Api.IntegrationTests.Discovery;

public class TrendingAndTagTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly Guid Demo = SeedIds.DemoUser.Value;

    private static async Task<Guid> PostAsync(HttpClient client, string content, double ageDays = 0)
    {
        var id = await client.CreatePostAsync(content);
        if (ageDays > 0)
        {
            Store.Posts.Update(new PostId(id), p => typeof(Post).GetProperty(nameof(Post.CreatedAt))!.SetValue(p, DateTime.UtcNow.AddDays(-ageDays)));
        }

        return id;
    }

    private static IReadOnlyList<(string Tag, int Count)> Tags(JsonElement body)
        => body.EnumerateArray().Select(t => (t.GetProperty("tag").GetString()!, t.GetProperty("postsCount").GetInt32())).ToList();

    private static IReadOnlyList<string> Names(JsonElement body) => Tags(body).Select(t => t.Tag).ToList();

    private static IReadOnlyList<Guid> Ids(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()).ToList();

    private static void MakePrivate(UserId id) => Store.Users.Update(id, x => x.UpdatePrivacySettings(new PrivacySettings(true, true, true)));

    private async Task<JsonElement> TrendingAsync(string query = "") => await (await Client.GetAsync($"/api/trending/tags{query}")).ReadJsonAsync();

    #region Trending

    [Fact]
    public async Task Trending_CountsPostsPerTag_OrdersByCountThenKey_AndUsesMostFrequentCasing()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await PostAsync(test, "#Coffee #code");
        await PostAsync(test, "#coffee");
        await PostAsync(test, "#Coffee and #zed");
        await PostAsync(test, "#alpha");

        Tags(await TrendingAsync()).Should().Equal(("Coffee", 3), ("alpha", 1), ("code", 1), ("zed", 1));
    }

    [Fact]
    public async Task Trending_Limit_IsBounded_Default5()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await PostAsync(test, string.Join(' ', Enumerable.Range(1, 8).Select(i => $"#t{i}")));

        Tags(await TrendingAsync()).Should().HaveCount(5);
        Tags(await TrendingAsync("?limit=2")).Should().HaveCount(2);
        (await Client.GetAsync("/api/trending/tags?limit=0")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await Client.GetAsync("/api/trending/tags?limit=51")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Trending_ExcludesDeletedBlockedAndPrivateAuthors()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        await PostAsync(test, "#visible");
        var deleted = await PostAsync(test, "#deleted");
        await test.DeleteAsync($"/api/posts/{deleted}");
        await PostAsync(demo, "#blocked");
        await PostAsync(admin, "#secret");
        MakePrivate(SeedIds.AdminUser);
        await test.PostAsync($"/api/users/{Demo}/blocks", null);

        Names(await (await test.GetAsync("/api/trending/tags")).ReadJsonAsync()).Should().Equal("visible");
        Names(await TrendingAsync()).Should().BeEquivalentTo("visible", "blocked");
    }

    [Fact]
    public async Task Trending_WidensWindow_7_then_30_then_365_Days()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await PostAsync(test, "#fresh");
        await PostAsync(test, "#month", ageDays: 20);
        await PostAsync(test, "#year", ageDays: 200);
        await PostAsync(test, "#ancient", ageDays: 400);

        Names(await TrendingAsync("?limit=1")).Should().Equal("fresh");
        Names(await TrendingAsync("?limit=2")).Should().BeEquivalentTo("fresh", "month");
        Names(await TrendingAsync("?limit=3")).Should().BeEquivalentTo("fresh", "month", "year");
        Names(await TrendingAsync("?limit=5")).Should().BeEquivalentTo(["fresh", "month", "year"], "365 days is the last window, even when it cannot reach the limit");
    }

    [Fact]
    public async Task Trending_CountIsWindowScoped_AndNeverAboveTheTagPageTotal()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await PostAsync(test, "#mix");
        await PostAsync(test, "#mix", ageDays: 3);
        await PostAsync(test, "#mix", ageDays: 100);

        var trending = Tags(await TrendingAsync("?limit=1"));
        var page = await (await Client.GetAsync("/api/tags/mix/posts")).ReadJsonAsync();

        trending.Should().Equal(("mix", 2));
        page.GetProperty("totalCount").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task Trending_Empty_Is200EmptyArray()
    {
        var response = await Client.GetAsync("/api/trending/tags");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.ReadJsonAsync()).GetArrayLength().Should().Be(0);
    }

    #endregion

    #region Tag posts

    [Fact]
    public async Task TagPosts_MatchesFoldedKey_WithOrWithoutHash_AndReportsMostFrequentCasing()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await PostAsync(test, "Chuyến đi #ĐàLạt");
        await PostAsync(test, "again #dalat");
        await PostAsync(test, "lần nữa #ĐàLạt");

        foreach (var route in new[] { "dalat", "DALAT", "%23dalat", "%C4%90%C3%A0L%E1%BA%A1t" })
        {
            var page = await (await Client.GetAsync($"/api/tags/{route}/posts")).ReadJsonAsync();
            page.GetProperty("totalCount").GetInt32().Should().Be(3, route);
            page.GetProperty("tag").GetString().Should().Be("ĐàLạt", route);
        }
    }

    [Fact]
    public async Task TagPosts_CasingTie_GoesToTheNewestPost()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await PostAsync(test, "#Old", ageDays: 1);
        await PostAsync(test, "#old");

        (await (await Client.GetAsync("/api/tags/old/posts")).ReadJsonAsync()).GetProperty("tag").GetString().Should().Be("old");
    }

    [Fact]
    public async Task TagPosts_SortLatest_And_Top_WithPaging()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var first = await PostAsync(test, "first #s", ageDays: 3);
        var second = await PostAsync(test, "second #s", ageDays: 2);
        var third = await PostAsync(test, "third #s", ageDays: 1);
        await demo.PutAsync($"/api/posts/{first}/like", null);

        Ids(await (await Client.GetAsync("/api/tags/s/posts?sort=latest")).ReadJsonAsync()).Should().Equal(third, second, first);
        Ids(await (await Client.GetAsync("/api/tags/s/posts?sort=top")).ReadJsonAsync()).Should().Equal(first, third, second);

        var paged = await (await Client.GetAsync("/api/tags/s/posts?pageSize=2&page=2")).ReadJsonAsync();
        Ids(paged).Should().Equal(first);
        paged.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();

        var beyond = await (await Client.GetAsync("/api/tags/s/posts?pageSize=2&page=9")).ReadJsonAsync();
        Ids(beyond).Should().BeEmpty();
        beyond.GetProperty("totalCount").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task TagPosts_UnknownTag_Is200Empty_EchoingTheInput()
    {
        var response = await Client.GetAsync("/api/tags/nothinghere/posts");
        var page = await response.ReadJsonAsync();

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        page.GetProperty("tag").GetString().Should().Be("nothinghere");
        page.GetProperty("totalCount").GetInt32().Should().Be(0);
        page.GetProperty("items").GetArrayLength().Should().Be(0);
    }

    [Theory]
    [InlineData("a%20b")]
    [InlineData("%20")]
    [InlineData("a-b")]
    public async Task TagPosts_InvalidTag_Is400(string tag)
        => (await Client.GetAsync($"/api/tags/{tag}/posts")).StatusCode.Should().Be(HttpStatusCode.BadRequest);

    [Fact]
    public async Task TagPosts_TooLongTag_Is400()
        => (await Client.GetAsync($"/api/tags/{new string('a', 51)}/posts")).StatusCode.Should().Be(HttpStatusCode.BadRequest);

    [Theory]
    [InlineData("sort=oldest")]
    [InlineData("page=0")]
    [InlineData("pageSize=0")]
    [InlineData("pageSize=51")]
    public async Task TagPosts_InvalidQuery_Is400(string query)
        => (await Client.GetAsync($"/api/tags/x/posts?{query}")).StatusCode.Should().Be(HttpStatusCode.BadRequest);

    [Fact]
    public async Task TagPosts_AppliesVisibility_PrivateBlockedAndDeleted()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var open = await PostAsync(test, "open #v");
        var gone = await PostAsync(test, "gone #v");
        await test.DeleteAsync($"/api/posts/{gone}");
        await PostAsync(demo, "blocked #v");
        await PostAsync(admin, "private #v");
        MakePrivate(SeedIds.AdminUser);
        await test.PostAsync($"/api/users/{Demo}/blocks", null);

        Ids(await (await test.GetAsync("/api/tags/v/posts")).ReadJsonAsync()).Should().Equal(open);
        Ids(await (await Client.GetAsync("/api/tags/v/posts")).ReadJsonAsync()).Should().HaveCount(2, "anonymous sees public authors only: test + demo");
    }

    [Fact]
    public async Task EditingAPost_ResyncsItsTags()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var id = await PostAsync(test, "#old topic");

        var update = await test.PutAsJsonAsync($"/api/posts/{id}", new { content = "#new topic" });

        update.StatusCode.Should().Be(HttpStatusCode.OK);
        Ids(await (await Client.GetAsync("/api/tags/old/posts")).ReadJsonAsync()).Should().BeEmpty();
        Ids(await (await Client.GetAsync("/api/tags/new/posts")).ReadJsonAsync()).Should().Equal(id);
    }

    #endregion
}
