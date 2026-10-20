using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Infrastructure.Persistence.Seeding;

namespace YSocial.Api.IntegrationTests.Errors;

public class RuleCodesTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("code").GetString().Should().Be(code);
    }

    [Fact]
    public async Task NonAuthorEditPost_Returns403_NotPostAuthor()
    {
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.PutAsJsonAsync($"/api/posts/{SeedIds.TestPost.Value}", new { content = "x" });

        await AssertProblemAsync(response, HttpStatusCode.Forbidden, "NotPostAuthor");
    }

    [Fact]
    public async Task FollowSelf_Returns400_CannotFollowSelf()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null);

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "CannotFollowSelf");
    }

    [Fact]
    public async Task BlockSelf_Returns400_CannotBlockSelf()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsync($"/api/users/{SeedIds.TestUser.Value}/blocks", null);

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "CannotBlockSelf");
    }

    [Fact]
    public async Task FollowBlockedEitherWay_Returns404_NotFound()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        // Viewer blocked target, and target blocked viewer: both look like "not found"
        await AssertProblemAsync(await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null), HttpStatusCode.NotFound, "NotFound");
        await AssertProblemAsync(await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/relations/follow", null), HttpStatusCode.NotFound, "NotFound");
    }

    [Fact]
    public async Task CloseFriendWithoutFollow_Returns400()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PatchAsJsonAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/close-friend", new { isCloseFriend = true });

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "CloseFriendRequiresAcceptedFollow");
    }

    [Fact]
    public async Task RestoreNotDeletedPost_Returns400_PostNotDeleted()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsync($"/api/posts/{SeedIds.TestPost.Value}/restore", null);

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "PostNotDeleted");
    }

    [Fact]
    public async Task InvalidOtp_Returns400_InvalidOtp()
    {
        (await Client.PostAsJsonAsync("/api/identities/forgot-password", new { loginId = Seed.TestLogin })).EnsureSuccessStatusCode();

        var response = await Client.PostAsJsonAsync("/api/identities/reset-password",
            new { loginId = Seed.TestLogin, otp = "000000", newPassword = "NewPassword123!" });

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "InvalidOtp");
    }

    [Fact]
    public async Task OtpAttemptsExceeded_Returns400()
    {
        (await Client.PostAsJsonAsync("/api/identities/forgot-password", new { loginId = Seed.TestLogin })).EnsureSuccessStatusCode();
        HttpResponseMessage? last = null;

        for (var i = 0; i < 5; i++)
        {
            last = await Client.PostAsJsonAsync("/api/identities/reset-password",
                new { loginId = Seed.TestLogin, otp = "000000", newPassword = "NewPassword123!" });
        }

        await AssertProblemAsync(last!, HttpStatusCode.BadRequest, "OtpAttemptsExceeded");
    }

    [Fact]
    public async Task UpdateProfile_InvalidField_Returns400_ProfileFieldInvalid()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsJsonAsync("/api/users/profiles/me",
            new { displayName = "", bio = "b", avatarUrl = (string?)null, coverUrl = (string?)null, gender = 0, dateOfBirth = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task DeleteDefaultProfile_Returns400_CannotDeleteDefaultProfile()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.DeleteAsync($"/api/users/profiles/{SeedIds.TestUser.Value}");

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "CannotDeleteDefaultProfile");
    }
}
