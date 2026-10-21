using System.Net;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Notifications;

public class NotificationKindFilterTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string List = "/api/notifications";

    private static readonly Guid TestPost = SeedIds.TestPost.Value;

    private static IReadOnlyList<string> Types(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("type").GetString()!).ToList();

    /// <summary>
    /// demo likes, comments on and follows test_user: NewLike, NewComment, NewFollow (oldest first).
    /// </summary>
    private async Task<HttpClient> ThreeKindsAsync()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();
        await Task.Delay(5);
        await demo.AddCommentAsync(TestPost, "nice");
        await Task.Delay(5);
        (await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();
        return test;
    }

    [Theory]
    [InlineData("like", "NewLike")]
    [InlineData("reply", "NewComment")]
    [InlineData("follow", "NewFollow")]
    public async Task Kind_ReturnsOnlyThatKind_CountsFilteredUnreadOverall(string kind, string type)
    {
        var test = await ThreeKindsAsync();

        var page = await (await test.GetAsync($"{List}?kind={kind}")).ReadJsonAsync();

        Types(page).Should().Equal(type);
        page.GetProperty("totalCount").GetInt32().Should().Be(1);
        page.GetProperty("unreadCount").GetInt32().Should().Be(3, "badge count never depends on the tab");
    }

    [Theory]
    [InlineData("")]
    [InlineData("?kind=")]
    [InlineData("?kind=%20")]
    public async Task KindAbsentOrEmpty_ReturnsAll(string query)
    {
        var test = await ThreeKindsAsync();

        var page = await (await test.GetAsync($"{List}{query}")).ReadJsonAsync();

        Types(page).Should().Equal("NewFollow", "NewComment", "NewLike");
    }

    [Theory]
    [InlineData("LIKE")]
    [InlineData("Like")]
    public async Task Kind_IsCaseInsensitive(string kind)
    {
        var test = await ThreeKindsAsync();

        var page = await (await test.GetAsync($"{List}?kind={kind}")).ReadJsonAsync();

        Types(page).Should().Equal("NewLike");
    }

    [Theory]
    [InlineData("mention")]
    [InlineData("x")]
    [InlineData("like,reply")]
    public async Task Kind_UnknownOrMalformed_400WithKindError(string kind)
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.GetAsync($"{List}?kind={kind}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await response.ReadJsonAsync();
        body.GetProperty("code").GetString().Should().Be("ValidationFailed");
        body.GetProperty("errors").TryGetProperty("kind", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Kind_Repeated_ObservedBinding_UsesOneValue()
    {
        var test = await ThreeKindsAsync();

        var response = await test.GetAsync($"{List}?kind=like&kind=reply");

        // Single string parameter: MVC keeps one value (documented in MAP D26), no custom binder
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        Types(await response.ReadJsonAsync()).Should().HaveCount(1);
    }

    [Fact]
    public async Task Kind_Paged_HasNextPageFollowsFilteredList()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();
        await demo.AddCommentAsync(TestPost, "a");
        await demo.AddCommentAsync(TestPost, "b");

        var first = await (await test.GetAsync($"{List}?kind=reply&pageSize=1")).ReadJsonAsync();
        var second = await (await test.GetAsync($"{List}?kind=reply&pageSize=1&page=2")).ReadJsonAsync();

        first.GetProperty("totalCount").GetInt32().Should().Be(2);
        first.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        second.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Kind_StillExcludesBlockedSenders()
    {
        var test = await ThreeKindsAsync();
        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        var page = await (await test.GetAsync($"{List}?kind=like")).ReadJsonAsync();

        page.GetProperty("totalCount").GetInt32().Should().Be(0);
    }
}
