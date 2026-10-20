using System.Net;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Posts;

public class ShareLinkTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly Guid TestPost = SeedIds.TestPost.Value;

    [Fact]
    public async Task ShareLink_UsesFePostRoute_NoUsernameNeeded()
    {
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.PostAsync($"/api/posts/{TestPost}/share-link", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadJsonAsync();
        body.GetProperty("postId").GetGuid().Should().Be(TestPost);
        body.GetProperty("sharedUrl").GetString().Should().EndWith($"/posts/{TestPost}").And.NotContain("/@");
    }

    [Fact]
    public async Task ShareLink_LegacyUsernameQuery_StillAccepted()
    {
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.PostAsync($"/api/posts/{TestPost}/share-link?username=test_user", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task ShareLink_UnknownPost_404()
    {
        var demo = await LoginAsync(Seed.DemoLogin);

        (await demo.PostAsync($"/api/posts/{Guid.NewGuid()}/share-link", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task ShareLink_HiddenPost_404()
    {
        Store.Users.Update(SeedIds.TestUser, x => x.UpdatePrivacySettings(new PrivacySettings(true, true, true)));
        var demo = await LoginAsync(Seed.DemoLogin);

        (await demo.PostAsync($"/api/posts/{TestPost}/share-link", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task ShareLink_Anonymous_401()
    {
        (await Client.PostAsync($"/api/posts/{TestPost}/share-link", null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
