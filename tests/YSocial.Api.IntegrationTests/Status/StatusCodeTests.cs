using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Status;

/// <summary>
/// D7/D8: no-payload endpoints answer 204, never a bare <c>true</c>.
/// </summary>
public class StatusCodeTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static async Task AssertNoBodyAsync(HttpResponseMessage response, HttpStatusCode status = HttpStatusCode.NoContent)
    {
        response.StatusCode.Should().Be(status);
        (await response.Content.ReadAsStringAsync()).Should().BeEmpty();
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private async Task<Guid> AddCommentAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/comments", new { postId = SeedIds.DemoPost.Value, content = "hello", parentCommentId = (Guid?)null });
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetGuid();
    }

    [Fact]
    public async Task Register_Returns201_AccountId()
    {
        var response = await Client.PostAsJsonAsync("/api/identities/register",
            new { email = "newuser@example.com", password = "Password123!", username = "new_user" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await JsonAsync(response);
        var accountId = body.GetProperty("accountId").GetGuid();
        MockDataStore.Accounts.Keys.Should().Contain(a => a.Value == accountId);
    }

    [Fact]
    public async Task DeletePost_Returns204()
    {
        var test = await LoginAsync(Seed.TestLogin);

        await AssertNoBodyAsync(await test.DeleteAsync($"/api/posts/{SeedIds.TestPost.Value}"));
    }

    [Fact]
    public async Task RestorePost_Returns204()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.DeleteAsync($"/api/posts/{SeedIds.TestPost.Value}");

        await AssertNoBodyAsync(await test.PutAsync($"/api/posts/{SeedIds.TestPost.Value}/restore", null));
    }

    [Fact]
    public async Task DeleteComment_Returns204()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var commentId = await AddCommentAsync(demo);

        await AssertNoBodyAsync(await demo.DeleteAsync($"/api/comments/{commentId}"));
    }

    [Fact]
    public async Task RestoreComment_Returns204()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var commentId = await AddCommentAsync(demo);
        await demo.DeleteAsync($"/api/comments/{commentId}");

        await AssertNoBodyAsync(await demo.PutAsync($"/api/comments/{commentId}/restore", null));
    }

    [Fact]
    public async Task DeleteProfile_Returns204()
    {
        var test = await LoginAsync(Seed.TestLogin);

        await AssertNoBodyAsync(await test.DeleteAsync($"/api/users/profiles/{SeedIds.TestUserAlt.Value}"));
    }

    [Fact]
    public async Task SetDefaultProfile_Returns204()
    {
        var test = await LoginAsync(Seed.TestLogin);

        await AssertNoBodyAsync(await test.PatchAsync($"/api/users/profiles/{SeedIds.TestUserAlt.Value}/default", null));
    }

    [Fact]
    public async Task DeleteAccount_Returns204()
    {
        var test = await LoginAsync(Seed.TestLogin);

        await AssertNoBodyAsync(await test.DeleteAsync("/api/identities/account"));
    }

    [Fact]
    public async Task Follow_ReturnsJsonFollowStatusLowercase()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/json");
        (await JsonAsync(response)).GetProperty("followStatus").GetString().Should().Be("accepted");
    }

    [Fact]
    public async Task Follow_PrivateTarget_ReturnsPending()
    {
        MockDataStore.Users[SeedIds.DemoUser].UpdatePrivacySettings(new PrivacySettings(true, true, true));
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);

        (await JsonAsync(response)).GetProperty("followStatus").GetString().Should().Be("pending");
    }

    [Fact]
    public async Task Follow_Repeated_StaysAccepted()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var url = $"/api/users/{SeedIds.DemoUser.Value}/relations/follow";
        await test.PostAsync(url, null);

        var second = await test.PostAsync(url, null);

        (await JsonAsync(second)).GetProperty("followStatus").GetString().Should().Be("accepted");
    }

    [Fact]
    public async Task UpdateProfile_Anonymous_Returns401()
    {
        var response = await Client.PutAsJsonAsync("/api/users/profiles/me",
            new { displayName = "x", bio = (string?)null, avatarUrl = (string?)null, coverUrl = (string?)null, gender = 0, dateOfBirth = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Theory]
    [InlineData("PUT", "/api/users/profiles/switch")]
    [InlineData("PATCH", "/api/users/profiles/00000000-0000-0000-0000-0000000000b2/default")]
    [InlineData("DELETE", "/api/users/profiles/00000000-0000-0000-0000-0000000000b2")]
    public async Task UsersWriteActions_Anonymous_Return401(string method, string url)
    {
        var request = new HttpRequestMessage(new HttpMethod(method), url);
        if (method == "PUT") request.Content = JsonContent.Create(new { profileId = SeedIds.TestUserAlt.Value, refreshToken = "x" });

        var response = await Client.SendAsync(request);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
