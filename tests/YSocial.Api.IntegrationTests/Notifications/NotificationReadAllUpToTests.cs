using System.Net;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Notifications;

public class NotificationReadAllUpToTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string List = "/api/notifications";

    private static readonly Guid TestPost = SeedIds.TestPost.Value;

    /// <summary>
    /// Ids newest first: [0] follow (newest), [1] comment, [2] like (oldest).
    /// </summary>
    private async Task<(HttpClient Test, HttpClient Demo, IReadOnlyList<Guid> Ids)> ThreeAsync()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();
        await Task.Delay(5);
        await demo.AddCommentAsync(TestPost, "nice");
        await Task.Delay(5);
        (await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();

        var page = await (await test.GetAsync(List)).ReadJsonAsync();
        var ids = page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("id").GetGuid()).ToList();
        return (test, demo, ids);
    }

    private static async Task<IReadOnlyList<bool>> ReadFlagsAsync(HttpClient client)
    {
        var page = await (await client.GetAsync(List)).ReadJsonAsync();
        return page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("isRead").GetBoolean()).ToList();
    }

    private static async Task<int> UnreadAsync(HttpClient client)
        => (await (await client.GetAsync($"{List}/unread-count")).ReadJsonAsync()).GetProperty("count").GetInt32();

    [Fact]
    public async Task UpToId_MarksThatAndOlder_LeavesNewerUnread()
    {
        var (test, _, ids) = await ThreeAsync();

        var response = await test.PutAsync($"{List}/read-all?upToId={ids[1]}", null);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await ReadFlagsAsync(test)).Should().Equal(false, true, true);
        (await UnreadAsync(test)).Should().Be(1);
    }

    [Fact]
    public async Task UpToId_Newest_MarksEverything()
    {
        var (test, _, ids) = await ThreeAsync();

        (await test.PutAsync($"{List}/read-all?upToId={ids[0]}", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await UnreadAsync(test)).Should().Be(0);
    }

    [Fact]
    public async Task UpToId_Absent_MarksEverything_Unchanged()
    {
        var (test, _, _) = await ThreeAsync();

        (await test.PutAsync($"{List}/read-all", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await UnreadAsync(test)).Should().Be(0);
    }

    [Fact]
    public async Task UpToId_Idempotent()
    {
        var (test, _, ids) = await ThreeAsync();

        (await test.PutAsync($"{List}/read-all?upToId={ids[2]}", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.PutAsync($"{List}/read-all?upToId={ids[2]}", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        (await UnreadAsync(test)).Should().Be(2);
    }

    [Fact]
    public async Task UpToId_Unknown_404()
    {
        var (test, _, _) = await ThreeAsync();

        var response = await test.PutAsync($"{List}/read-all?upToId={Guid.NewGuid()}", null);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("NotFound");
        (await UnreadAsync(test)).Should().Be(3);
    }

    [Fact]
    public async Task UpToId_OtherRecipients_403_NothingMarked()
    {
        var (test, demo, ids) = await ThreeAsync();

        var response = await demo.PutAsync($"{List}/read-all?upToId={ids[0]}", null);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("NotNotificationRecipient");
        (await UnreadAsync(test)).Should().Be(3);
    }

    [Fact]
    public async Task UpToId_OfBlockedSender_StillAccepted_HiddenRowsStayUnread()
    {
        var (test, _, ids) = await ThreeAsync();
        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        var response = await test.PutAsync($"{List}/read-all?upToId={ids[0]}", null);
        await test.DeleteAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await UnreadAsync(test)).Should().Be(3, "rows of a hidden sender are never touched");
    }

    [Fact]
    public async Task UpToId_RequiresAuth()
    {
        (await Client.PutAsync($"{List}/read-all?upToId={Guid.NewGuid()}", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
