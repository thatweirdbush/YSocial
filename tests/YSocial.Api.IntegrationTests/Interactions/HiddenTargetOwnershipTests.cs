using FluentAssertions;
using System.Net;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Interactions;

/// <summary>
/// Delete/restore of posts and comments never reveals a hidden target: outsiders get 404 BEFORE the ownership 403 (BG s6.3).
/// </summary>
public class HiddenTargetOwnershipTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly Guid TestPost = SeedIds.TestPost.Value;

    private static void MakePrivate(UserId id) => MockDataStore.Users[id].UpdatePrivacySettings(new PrivacySettings(true, true, true));

    private async Task<HttpClient> AdminAsync() => await LoginAsync(Seed.AdminLogin, "admin");

    private static async Task AssertCodeAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be(code);
    }

    #region Posts

    [Fact]
    public async Task DeletePost_VisibleNonAuthor_403_NotPostAuthor()
    {
        var admin = await AdminAsync();

        await AssertCodeAsync(await admin.DeleteAsync($"/api/posts/{TestPost}"), HttpStatusCode.Forbidden, "NotPostAuthor");
    }

    [Fact]
    public async Task DeletePost_HiddenFromNonAuthor_404_NotFound()
    {
        MakePrivate(SeedIds.TestUser);
        var admin = await AdminAsync();

        await AssertCodeAsync(await admin.DeleteAsync($"/api/posts/{TestPost}"), HttpStatusCode.NotFound, "NotFound");
        MockDataStore.Posts[SeedIds.TestPost].IsDeleted.Should().BeFalse();
    }

    [Fact]
    public async Task DeletePost_BlockedEitherWay_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await AdminAsync();
        await test.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null);

        await AssertCodeAsync(await admin.DeleteAsync($"/api/posts/{TestPost}"), HttpStatusCode.NotFound, "NotFound");
    }

    [Fact]
    public async Task RestorePost_NonAuthor_OnDeletedPost_404_AuthorStillRestores()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await AdminAsync();
        (await test.DeleteAsync($"/api/posts/{TestPost}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        await AssertCodeAsync(await admin.PutAsync($"/api/posts/{TestPost}/restore", null), HttpStatusCode.NotFound, "NotFound");

        (await test.PutAsync($"/api/posts/{TestPost}/restore", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task RestorePost_NonAuthor_OnLivePost_403_NotPostAuthor()
    {
        var admin = await AdminAsync();

        await AssertCodeAsync(await admin.PutAsync($"/api/posts/{TestPost}/restore", null), HttpStatusCode.Forbidden, "NotPostAuthor");
    }

    #endregion

    #region Comments

    private async Task<Guid> DemoCommentAsync()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        return await demo.AddCommentAsync(TestPost, "from demo");
    }

    [Fact]
    public async Task DeleteComment_VisibleOutsider_403()
    {
        var comment = await DemoCommentAsync();
        var admin = await AdminAsync();

        await AssertCodeAsync(await admin.DeleteAsync($"/api/comments/{comment}"), HttpStatusCode.Forbidden, "NotCommentAuthorOrPostOwner");
    }

    [Fact]
    public async Task DeleteComment_RootPostHiddenFromOutsider_404()
    {
        var comment = await DemoCommentAsync();
        MakePrivate(SeedIds.TestUser);
        var admin = await AdminAsync();

        await AssertCodeAsync(await admin.DeleteAsync($"/api/comments/{comment}"), HttpStatusCode.NotFound, "NotFound");
    }

    [Fact]
    public async Task DeleteComment_PostOwnerAndAuthor_StillAllowed()
    {
        var comment = await DemoCommentAsync();
        var test = await LoginAsync(Seed.TestLogin);

        (await test.DeleteAsync($"/api/comments/{comment}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task RestoreComment_Outsider_404_Participant_403_Deleter_204()
    {
        var comment = await DemoCommentAsync();
        var demo = await LoginAsync(Seed.DemoLogin);
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await AdminAsync();
        (await demo.DeleteAsync($"/api/comments/{comment}")).StatusCode.Should().Be(HttpStatusCode.NoContent);

        await AssertCodeAsync(await admin.PutAsync($"/api/comments/{comment}/restore", null), HttpStatusCode.NotFound, "NotFound");
        await AssertCodeAsync(await test.PutAsync($"/api/comments/{comment}/restore", null), HttpStatusCode.Forbidden, "NotCommentDeleter");
        (await demo.PutAsync($"/api/comments/{comment}/restore", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    #endregion
}
