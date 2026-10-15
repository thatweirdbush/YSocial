using FluentAssertions;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.UserRelations;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Characterization;

/// <summary>
/// Pins behavior that MUST survive the recovery plan. Statuses that later tasks change are asserted loosely.
/// </summary>
public class CharacterizationTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    [Fact]
    public async Task Register_Login_CreatePostWithImage_GetPost_Returns200()
    {
        var register = await Client.PostAsJsonAsync("/api/identities/register", new { email = "newuser@example.com", password = "Password123!", username = "new_user" });
        register.IsSuccessStatusCode.Should().BeTrue();

        var user = await LoginAsync("newuser@example.com", "Password123!");
        var create = await user.PostAsJsonAsync("/api/posts", new { content = "hello", imageUrl = "https://img.test/a.png" });
        create.IsSuccessStatusCode.Should().BeTrue();
        var postId = (await JsonAsync(create)).GetProperty("postId").GetGuid();

        var get = await Client.GetAsync($"/api/posts/{postId}");

        get.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task FollowPublicUserTwice_BothReturn200Accepted_SingleEdge()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var url = $"/api/users/{SeedIds.DemoUser.Value}/relations/follow";

        var first = await test.PostAsync(url, null);
        var second = await test.PostAsync(url, null);

        first.StatusCode.Should().Be(HttpStatusCode.OK);
        second.StatusCode.Should().Be(HttpStatusCode.OK);
        (await JsonAsync(first)).GetProperty("followStatus").GetString().Should().Be("accepted");
        (await JsonAsync(second)).GetProperty("followStatus").GetString().Should().Be("accepted");

        var edges = MockDataStore.UserRelations.Values
            .Where(r => r.ObserverId == SeedIds.TestUser && r.TargetId == SeedIds.DemoUser)
            .ToList();
        edges.Should().ContainSingle();
        edges[0].IsDeleted.Should().BeFalse();
        edges[0].FollowStatus.Should().Be(FollowStatus.Accepted);
    }

    [Fact]
    public async Task UnfollowAbsentEdge_Returns204()
    {
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.DeleteAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow");

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task BlockTwice_Returns204()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var url = $"/api/users/{SeedIds.DemoUser.Value}/blocks";

        (await test.PostAsync(url, null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.PostAsync(url, null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task ToggleLike_OnThenOff()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var body = new { targetId = SeedIds.DemoPost.Value, targetType = 1 };

        var on = await JsonAsync(await test.PostAsJsonAsync("/api/likes/toggle", body));
        var off = await JsonAsync(await test.PostAsJsonAsync("/api/likes/toggle", body));

        on.GetProperty("isLiked").GetBoolean().Should().BeTrue();
        off.GetProperty("isLiked").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task SavedToggle_ThenListContainsPost()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var toggle = await JsonAsync(await test.PostAsJsonAsync("/api/saveditems/toggle", new { targetId = SeedIds.DemoPost.Value, targetType = 1 }));
        var list = await JsonAsync(await test.GetAsync("/api/saveditems/posts"));

        toggle.GetProperty("isSaved").GetBoolean().Should().BeTrue();
        list.EnumerateArray().Select(p => p.GetProperty("id").GetGuid()).Should().Contain(SeedIds.DemoPost.Value);
    }

    [Fact]
    public async Task UpdateProfile_Returns200()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsJsonAsync("/api/users/profiles/me",
            new { displayName = "New Name", bio = "bio", avatarUrl = (string?)null, coverUrl = (string?)null, gender = 0, dateOfBirth = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task SwitchProfile_ReturnsTokenWithOtherUserId()
    {
        var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password);
        Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);

        var response = await Client.PutAsJsonAsync("/api/users/profiles/switch",
            new { profileId = SeedIds.TestUserAlt.Value, refreshToken = tokens.RefreshToken });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var newAccess = (await JsonAsync(response)).GetProperty("accessToken").GetString()!;
        var jwt = new JwtSecurityTokenHandler().ReadJwtToken(newAccess);
        jwt.Claims.Single(c => c.Type == "user_id").Value.Should().Be(SeedIds.TestUserAlt.Value.ToString());
        jwt.Claims.Single(c => c.Type == "sub").Value.Should().Be(SeedIds.TestAccount.Value.ToString());
    }

    [Fact]
    public async Task DeletePost_ThenGet404_ThenRestoreByAuthor()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var url = $"/api/posts/{SeedIds.TestPost.Value}";

        (await test.DeleteAsync(url)).IsSuccessStatusCode.Should().BeTrue();
        (await Client.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.NotFound);

        (await test.PutAsync($"{url}/restore", null)).IsSuccessStatusCode.Should().BeTrue();
        (await Client.GetAsync(url)).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    #region Known defects (target behavior, un-skipped by owner task)


    [Fact]
    public async Task NonAuthorEditPost_Returns403()
    {
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.PutAsJsonAsync($"/api/posts/{SeedIds.TestPost.Value}", new { content = "x" });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Logout_ActiveToken_Returns204()
    {
        var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password);

        var response = await Client.PostAsJsonAsync("/api/identities/logout", new { refreshToken = tokens.RefreshToken });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Login_WrongPassword_Returns401()
    {
        var response = await Client.PostAsJsonAsync("/api/identities/login", new { loginId = Seed.TestLogin, password = "wrong", deviceId = "x" });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    #endregion
}
