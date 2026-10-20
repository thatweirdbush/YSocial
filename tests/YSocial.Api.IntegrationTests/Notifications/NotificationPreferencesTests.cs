using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Notifications;

public class NotificationPreferencesTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string Route = "/api/notifications/preferences";

    private static readonly Guid TestPost = SeedIds.TestPost.Value;

    private static void SetPreferences(UserId user, bool likes, bool replies, bool follows)
        => Store.Users.Update(user, u => u.UpdateNotificationPreferences(new NotificationPreferences(likes, replies, follows)));

    #region Endpoints

    [Fact]
    public async Task Get_DefaultsAllTrue()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var body = await (await test.GetAsync(Route)).ReadJsonAsync();

        body.GetProperty("likes").GetBoolean().Should().BeTrue();
        body.GetProperty("replies").GetBoolean().Should().BeTrue();
        body.GetProperty("follows").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Put_ReplacesAll_Returns200Dto_GetReflects()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var put = await test.PutAsJsonAsync(Route, new { likes = false, replies = true, follows = false });
        var get = await (await test.GetAsync(Route)).ReadJsonAsync();

        put.StatusCode.Should().Be(HttpStatusCode.OK);
        var dto = await put.ReadJsonAsync();
        dto.GetProperty("likes").GetBoolean().Should().BeFalse();
        dto.GetProperty("replies").GetBoolean().Should().BeTrue();
        dto.GetProperty("follows").GetBoolean().Should().BeFalse();
        get.GetProperty("likes").GetBoolean().Should().BeFalse();
        get.GetProperty("follows").GetBoolean().Should().BeFalse();
    }

    [Theory]
    [InlineData("{\"likes\":false,\"replies\":false}")]
    [InlineData("{\"likes\":false,\"replies\":false,\"follows\":null}")]
    [InlineData("{}")]
    public async Task Put_MissingField_400_NothingChanged(string json)
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsync(Route, new StringContent(json, Encoding.UTF8, "application/json"));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("ValidationFailed");
        var get = await (await test.GetAsync(Route)).ReadJsonAsync();
        get.GetProperty("likes").GetBoolean().Should().BeTrue();
        get.GetProperty("replies").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Endpoints_RequireAuth()
    {
        (await Client.GetAsync(Route)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client.PutAsJsonAsync(Route, new { likes = true, replies = true, follows = true })).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    #endregion

    #region Publisher

    [Fact]
    public async Task LikesOff_PostLikeSkipped_NoRowNoOutbox_ButReplyStillNotifies()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await test.PutAsJsonAsync(Route, new { likes = false, replies = true, follows = true })).EnsureSuccessStatusCode();

        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();

        Store.Notifications.Should().BeEmpty();
        Store.Messages.Should().BeEmpty();

        await demo.AddCommentAsync(TestPost, "hi");

        Store.Notifications.Values.Should().ContainSingle().Which.Type.Should().Be(NotificationType.NewComment);
    }

    [Fact]
    public async Task LikesOff_CommentLikeSkippedToo()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var comment = await test.AddCommentAsync(TestPost, "mine");
        (await test.PutAsJsonAsync(Route, new { likes = false, replies = true, follows = true })).EnsureSuccessStatusCode();

        (await demo.PutAsync($"/api/comments/{comment}/like", null)).EnsureSuccessStatusCode();

        Store.Notifications.Should().BeEmpty();
    }

    [Fact]
    public async Task RepliesOff_CommentSkipped_LikeStillNotifies()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        SetPreferences(SeedIds.TestUser, true, false, true);

        await demo.AddCommentAsync(TestPost, "hi");
        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();

        Store.Notifications.Values.Should().ContainSingle().Which.Type.Should().Be(NotificationType.NewLike);
    }

    [Fact]
    public async Task FollowsOff_NewFollowSkipped()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        SetPreferences(SeedIds.TestUser, true, true, false);

        (await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();

        Store.Notifications.Should().BeEmpty();
        Store.Messages.Should().BeEmpty();
    }

    [Fact]
    public async Task FollowsOff_FollowRequestedSkipped()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        Store.Users.Update(SeedIds.TestUser, u => u.UpdatePrivacySettings(new PrivacySettings(true, true, true)));
        SetPreferences(SeedIds.TestUser, true, true, false);

        (await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();

        Store.Notifications.Should().BeEmpty();
    }

    [Fact]
    public async Task FollowsOff_FollowAcceptedSkipped_ForRequester()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        Store.Users.Update(SeedIds.TestUser, u => u.UpdatePrivacySettings(new PrivacySettings(true, true, true)));
        (await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();
        SetPreferences(SeedIds.DemoUser, true, true, false);

        (await test.PostAsJsonAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow-request", new { decision = "accept" })).EnsureSuccessStatusCode();

        Store.Notifications.Values.Should().NotContain(n => n.Type == NotificationType.FollowAccepted);
    }

    [Fact]
    public async Task TurningBackOn_DoesNotBackfill_NewEventsNotify()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await test.PutAsJsonAsync(Route, new { likes = false, replies = true, follows = true })).EnsureSuccessStatusCode();
        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();
        (await test.PutAsJsonAsync(Route, new { likes = true, replies = true, follows = true })).EnsureSuccessStatusCode();

        Store.Notifications.Should().BeEmpty();

        (await demo.DeleteAsync($"/api/posts/{TestPost}/like")).EnsureSuccessStatusCode();
        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();

        Store.Notifications.Values.Should().ContainSingle().Which.Type.Should().Be(NotificationType.NewLike);
    }

    [Fact]
    public async Task OtherRecipientsPreferences_DoNotAffect()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var test = await LoginAsync(Seed.TestLogin);
        SetPreferences(SeedIds.DemoUser, false, false, false);

        (await demo.PutAsync($"/api/posts/{TestPost}/like", null)).EnsureSuccessStatusCode();

        Store.Notifications.Values.Should().ContainSingle(n => n.RecipientId == SeedIds.TestUser);
        (await (await test.GetAsync("/api/notifications")).ReadJsonAsync()).GetProperty("totalCount").GetInt32().Should().Be(1);
    }

    #endregion
}
