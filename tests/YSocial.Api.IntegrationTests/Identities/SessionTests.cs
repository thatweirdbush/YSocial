using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Identities;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Identities;

public class SessionTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static Account TestAccount => Store.Accounts[SeedIds.TestAccount];

    private static int ActiveTokens(Account account) => account.RefreshTokens.Count(t => t.IsActive);

    private Task<HttpResponseMessage> LogoutAsync(string? refreshToken, HttpClient? client = null)
        => (client ?? Client).PostAsJsonAsync("/api/identities/logout", new { refreshToken });

    private Task<LoginTokens> TokensAsync(string deviceId = "tests", string loginId = Seed.TestLogin, string password = Seed.Password)
        => AuthHelper.RequestTokensAsync(Client, loginId, password, deviceId);

    private static RefreshToken Find(string token) => TestAccount.RefreshTokens.Single(t => t.Token == token);

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    #region Logout

    [Fact]
    public async Task Logout_ActiveToken_Returns204_TokenRevoked()
    {
        var tokens = await TokensAsync();

        var response = await LogoutAsync(tokens.RefreshToken);

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Find(tokens.RefreshToken).IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task Logout_UnknownToken_Returns204()
        => (await LogoutAsync(Guid.NewGuid().ToString())).StatusCode.Should().Be(HttpStatusCode.NoContent);

    [Fact]
    public async Task Logout_RevokedToken_Returns204()
    {
        var tokens = await TokensAsync();
        await LogoutAsync(tokens.RefreshToken);

        (await LogoutAsync(tokens.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Logout_ExpiredToken_Returns204()
    {
        var tokens = await TokensAsync();
        AccountArrange.ExpireToken(SeedIds.TestAccount, tokens.RefreshToken, DateTime.UtcNow.AddDays(-1));

        (await LogoutAsync(tokens.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Logout_Twice_Returns204()
    {
        var tokens = await TokensAsync();

        (await LogoutAsync(tokens.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await LogoutAsync(tokens.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Logout_WithoutAccessToken_StillRevokes()
    {
        var tokens = await TokensAsync();
        Client.DefaultRequestHeaders.Authorization.Should().BeNull();

        (await LogoutAsync(tokens.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Find(tokens.RefreshToken).IsActive.Should().BeFalse();
    }

    [Fact]
    public async Task Logout_EmptyBody_Returns400_ValidationFailed()
    {
        var response = await LogoutAsync("");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("ValidationFailed");
    }

    [Fact]
    public async Task Logout_AccessTokenStillValidUntilExpiry()
    {
        var tokens = await TokensAsync();
        await LogoutAsync(tokens.RefreshToken);
        Client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);

        // D6: no per-request revocation, documented behavior
        var response = await Client.PostAsJsonAsync("/api/posts", new { content = "still allowed" });

        response.IsSuccessStatusCode.Should().BeTrue();
    }

    #endregion

    #region Session cap

    [Fact]
    public async Task SixthLogin_EvictsOldestSession()
    {
        var first = await TokensAsync("d1");
        for (var i = 2; i <= 5; i++) await TokensAsync($"d{i}");
        ActiveTokens(TestAccount).Should().Be(5);

        var sixth = await TokensAsync("d6");

        ActiveTokens(TestAccount).Should().Be(5);
        Find(first.RefreshToken).IsActive.Should().BeFalse();
        Find(sixth.RefreshToken).IsActive.Should().BeTrue();
    }

    [Fact]
    public async Task ConcurrentLogins_AtCap_ActiveNeverAbove5()
    {
        var results = await Task.WhenAll(Enumerable.Range(1, 20).Select(i => Task.Run(() => TokensAsync($"dev{i}"))));

        results.Should().HaveCount(20);
        ActiveTokens(TestAccount).Should().Be(5);
    }

    [Fact]
    public async Task ConcurrentLogoutAndLogin_NoListCorruption()
    {
        var seeded = new List<LoginTokens>();
        for (var i = 0; i < 4; i++) seeded.Add(await TokensAsync($"seed{i}"));

        var logins = Enumerable.Range(1, 10).Select(i => Task.Run(async () => (await TokensAsync($"c{i}")).RefreshToken));
        var logouts = seeded.Select(t => Task.Run(async () => (await LogoutAsync(t.RefreshToken)).StatusCode));

        var loginTokens = await Task.WhenAll(logins);
        var logoutStatuses = await Task.WhenAll(logouts);

        logoutStatuses.Should().AllBeEquivalentTo(HttpStatusCode.NoContent);
        loginTokens.Should().HaveCount(10);
        ActiveTokens(TestAccount).Should().BeLessThanOrEqualTo(5);
        TestAccount.RefreshTokens.Select(t => t.Token).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task LoginLogoutLoop_NeverLocksAccount()
    {
        for (var i = 0; i < 10; i++)
        {
            var tokens = await TokensAsync($"loop{i}");
            (await LogoutAsync(tokens.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        }

        (await TokensAsync("final")).AccessToken.Should().NotBeNullOrEmpty();
    }

    #endregion

    #region Login failures

    private async Task<(HttpStatusCode Status, string Body)> LoginFailureAsync(string loginId, string password)
    {
        var response = await Client.PostAsJsonAsync("/api/identities/login", new { loginId, password, deviceId = "x" });
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        // traceId & instance differ per request by design
        var stable = doc.RootElement.EnumerateObject()
            .Where(p => p.Name is not ("traceId" or "instance"))
            .ToDictionary(p => p.Name, p => p.Value.ToString());

        return (response.StatusCode, JsonSerializer.Serialize(stable.OrderBy(p => p.Key).ToDictionary(p => p.Key, p => p.Value)));
    }

    [Fact]
    public async Task Login_UnknownWrongPasswordDeleted_IdenticalBody401()
    {
        Store.Accounts.Update(SeedIds.DemoAccount, x => x.Delete());

        var unknown = await LoginFailureAsync("nobody@example.com", Seed.Password);
        var wrongPassword = await LoginFailureAsync(Seed.TestLogin, "WrongPassword!");
        var deleted = await LoginFailureAsync(Seed.DemoLogin, Seed.Password);

        unknown.Status.Should().Be(HttpStatusCode.Unauthorized);
        wrongPassword.Should().Be(unknown);
        deleted.Should().Be(unknown);
        unknown.Body.Should().Contain("InvalidCredentials");
    }

    [Fact]
    public async Task Login_InactiveWithWrongPassword_Returns401()
    {
        Store.Accounts.Update(SeedIds.TestAccount, x => x.Deactivate());

        var failure = await LoginFailureAsync(Seed.TestLogin, "WrongPassword!");

        failure.Status.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Login_InactiveWithValidPassword_Returns403()
    {
        Store.Accounts.Update(SeedIds.TestAccount, x => x.Deactivate());

        var response = await Client.PostAsJsonAsync("/api/identities/login", new { loginId = Seed.TestLogin, password = Seed.Password, deviceId = "x" });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("AccountInactive");
    }

    #endregion

    #region Reset password

    [Fact]
    public async Task ResetPassword_RevokesAllTokens()
    {
        var tokens = await TokensAsync();
        var otp = IssueOtp();

        var response = await Client.PostAsJsonAsync("/api/identities/reset-password",
            new { loginId = Seed.TestLogin, otp, newPassword = "NewPassword123!" });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Find(tokens.RefreshToken).IsActive.Should().BeFalse();
        ActiveTokens(TestAccount).Should().Be(0);
        (await TokensAsync("again", password: "NewPassword123!")).AccessToken.Should().NotBeNullOrEmpty();
    }

    private static string IssueOtp()
    {
        return AccountArrange.IssueOtp(SeedIds.TestAccount);
    }

    #endregion
}
