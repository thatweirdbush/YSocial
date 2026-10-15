using FluentAssertions;
using System.Net;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Notifications;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Notifications;

public class NotificationTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string List = "/api/notifications";

    private static readonly Guid TestPost = SeedIds.TestPost.Value;

    private static IReadOnlyList<string> Types(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("type").GetString()!).ToList();

    /// <summary>
    /// demo likes + comments on the seed post of test_user: 2 notifications for test_user.
    /// </summary>
    private async Task<(HttpClient Test, HttpClient Demo)> LikeAndCommentAsync()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();
        await Task.Delay(5);
        await demo.AddCommentAsync(TestPost, "nice");
        return (test, demo);
    }

    #region Self notifications

    [Fact]
    public async Task SelfLike_NoNotification_NoOutbox()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();

        MockDataStore.Notifications.Should().BeEmpty();
        MockDataStore.Messages.Should().BeEmpty();
    }

    [Fact]
    public async Task SelfComment_NoNotification()
    {
        var test = await LoginAsync(Seed.TestLogin);

        await test.AddCommentAsync(TestPost, "note to self");

        MockDataStore.Notifications.Should().BeEmpty();
    }

    #endregion

    #region List

    [Fact]
    public async Task List_NewestFirst_FeShapedItems_WithUnreadCount()
    {
        var (test, _) = await LikeAndCommentAsync();

        var page = await (await test.GetAsync(List)).ReadJsonAsync();

        Types(page).Should().Equal("NewComment", "NewLike");
        page.GetProperty("totalCount").GetInt32().Should().Be(2);
        page.GetProperty("unreadCount").GetInt32().Should().Be(2);
        var like = page.GetProperty("items")[1];
        like.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(
            ["id", "type", "kind", "title", "message", "createdAt", "isRead", "targetId", "senderId", "senderName", "senderUsername", "senderAvatar"]);
        like.GetProperty("kind").GetString().Should().Be("like");
        like.GetProperty("isRead").GetBoolean().Should().BeFalse();
        like.GetProperty("targetId").GetGuid().Should().Be(TestPost);
        like.GetProperty("senderId").GetGuid().Should().Be(SeedIds.DemoUser.Value);
        like.GetProperty("senderName").GetString().Should().NotBeNullOrEmpty();
        page.GetProperty("items")[0].GetProperty("kind").GetString().Should().Be("reply");
    }

    [Fact]
    public async Task CommentAndCommentLike_TargetIsRootPost_SenderUsernameSet()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var comment = await test.AddCommentAsync(TestPost, "mine");
        await demo.AddCommentAsync(TestPost, "reply");
        (await demo.PutAsync($"/api/comments/{comment}/like", null)).EnsureSuccessStatusCode();

        var items = (await (await test.GetAsync(List)).ReadJsonAsync()).GetProperty("items").EnumerateArray().ToList();

        items.Should().HaveCount(2);
        items.Should().OnlyContain(i => i.GetProperty("targetId").GetGuid() == TestPost);
        items.Should().OnlyContain(i => i.GetProperty("senderUsername").GetString() == "demo_user");
    }

    [Fact]
    public async Task MarkAllRead_SkipsHiddenSenders()
    {
        var (test, _) = await LikeAndCommentAsync();
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null);

        await test.PutAsync($"{List}/read-all", null);
        await test.DeleteAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks");

        (await (await test.GetAsync($"{List}/unread-count")).ReadJsonAsync()).GetProperty("count").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task List_OnlyOwnNotifications()
    {
        var (_, demo) = await LikeAndCommentAsync();

        var page = await (await demo.GetAsync(List)).ReadJsonAsync();

        page.GetProperty("items").GetArrayLength().Should().Be(0);
        page.GetProperty("totalCount").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task List_Paged_BeyondLastIsEmptyWithMetadata()
    {
        var (test, _) = await LikeAndCommentAsync();

        var first = await (await test.GetAsync($"{List}?page=1&pageSize=1")).ReadJsonAsync();
        var beyond = await (await test.GetAsync($"{List}?page=5&pageSize=1")).ReadJsonAsync();

        first.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        first.GetProperty("items").GetArrayLength().Should().Be(1);
        beyond.GetProperty("items").GetArrayLength().Should().Be(0);
        beyond.GetProperty("totalCount").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task List_ExcludesBlockedAndDeletedSenders_BeforePagingAndCounts()
    {
        var (test, _) = await LikeAndCommentAsync();
        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        var page = await (await test.GetAsync(List)).ReadJsonAsync();
        var count = await (await test.GetAsync($"{List}/unread-count")).ReadJsonAsync();

        page.GetProperty("items").GetArrayLength().Should().Be(0);
        page.GetProperty("totalCount").GetInt32().Should().Be(0);
        page.GetProperty("unreadCount").GetInt32().Should().Be(0);
        count.GetProperty("count").GetInt32().Should().Be(0);
    }

    [Theory]
    [InlineData("?page=0")]
    [InlineData("?pageSize=0")]
    [InlineData("?pageSize=51")]
    public async Task List_InvalidPaging_400(string query)
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.GetAsync(List + query)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Endpoints_RequireAuth()
    {
        (await Client.GetAsync(List)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client.GetAsync($"{List}/unread-count")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client.PutAsync($"{List}/{Guid.NewGuid()}/read", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client.PutAsync($"{List}/read-all", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    #endregion

    #region Mark read

    [Fact]
    public async Task MarkRead_Recipient_204_Idempotent_UpdatesUnreadCount()
    {
        var (test, _) = await LikeAndCommentAsync();
        var id = (await (await test.GetAsync(List)).ReadJsonAsync()).GetProperty("items")[0].GetProperty("id").GetGuid();

        var first = await test.PutAsync($"{List}/{id}/read", null);
        var second = await test.PutAsync($"{List}/{id}/read", null);

        first.StatusCode.Should().Be(HttpStatusCode.NoContent);
        second.StatusCode.Should().Be(HttpStatusCode.NoContent);
        var page = await (await test.GetAsync(List)).ReadJsonAsync();
        page.GetProperty("items")[0].GetProperty("isRead").GetBoolean().Should().BeTrue();
        page.GetProperty("unreadCount").GetInt32().Should().Be(1);
        (await (await test.GetAsync($"{List}/unread-count")).ReadJsonAsync()).GetProperty("count").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task MarkRead_OtherRecipient_403_NotNotificationRecipient()
    {
        var (test, demo) = await LikeAndCommentAsync();
        var id = (await (await test.GetAsync(List)).ReadJsonAsync()).GetProperty("items")[0].GetProperty("id").GetGuid();

        var response = await demo.PutAsync($"{List}/{id}/read", null);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("NotNotificationRecipient");
        MockDataStore.Notifications.Values.Should().OnlyContain(n => !n.IsRead);
    }

    [Fact]
    public async Task MarkRead_Unknown_404()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsync($"{List}/{Guid.NewGuid()}/read", null);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("NotFound");
    }

    [Fact]
    public async Task MarkAllRead_MarksOnlyOwn_Idempotent()
    {
        var (test, _) = await LikeAndCommentAsync();
        (await test.PutAsync($"/api/posts/{SeedIds.DemoPost.Value}/like", null)).EnsureSuccessStatusCode();

        var first = await test.PutAsync($"{List}/read-all", null);
        var second = await test.PutAsync($"{List}/read-all", null);

        first.StatusCode.Should().Be(HttpStatusCode.NoContent);
        second.StatusCode.Should().Be(HttpStatusCode.NoContent);
        MockDataStore.Notifications.Values.Where(n => n.RecipientId == SeedIds.TestUser).Should().OnlyContain(n => n.IsRead);
        MockDataStore.Notifications.Values.Where(n => n.RecipientId == SeedIds.DemoUser).Should().OnlyContain(n => !n.IsRead);
    }

    #endregion

    #region Types & outbox

    [Fact]
    public async Task FollowPublicUser_NotifiesNewFollow_RequestAccept_NotifiesFollowAccepted()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();

        var page = await (await demo.GetAsync(List)).ReadJsonAsync();

        Types(page).Should().Equal("NewFollow");
        var item = page.GetProperty("items")[0];
        item.GetProperty("kind").GetString().Should().Be("follow");
        item.GetProperty("targetId").GetGuid().Should().Be(SeedIds.TestUser.Value, "follow notifications point to the follower");
        MockDataStore.Notifications.Values.Should().ContainSingle(n => n.Type == NotificationType.NewFollow);
    }

    [Fact]
    public async Task Event_EnqueuesFeShapedPayload_ToOutbox()
    {
        var (_, _) = await LikeAndCommentAsync();

        MockDataStore.Messages.Should().HaveCount(2);
        using var doc = JsonDocument.Parse(MockDataStore.Messages[0].Content);
        doc.RootElement.GetProperty("RecipientId").GetGuid().Should().Be(SeedIds.TestUser.Value);
        doc.RootElement.GetProperty("Payload").GetProperty("Type").GetString().Should().Be("NewLike");
    }

    #endregion
}
