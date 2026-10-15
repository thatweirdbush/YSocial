using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Identities;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Identities;

public class RefreshTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static Account TestAccount => MockDataStore.Accounts[SeedIds.TestAccount];

    private static int ActiveTokens(Account account) => account.RefreshTokens.Count(t => t.IsActive);

    private static RefreshToken Find(string token) => TestAccount.RefreshTokens.Single(t => t.Token == token);

    private Task<LoginTokens> LoginTokensAsync(string deviceId = "tests", string loginId = Seed.TestLogin)
        => AuthHelper.RequestTokensAsync(Client, loginId, Seed.Password, deviceId);

    private Task<HttpResponseMessage> RefreshAsync(string refreshToken, HttpClient? client = null)
        => (client ?? Client).PostAsJsonAsync("/api/identities/refresh-token", new { refreshToken });

    private Task<HttpResponseMessage> LogoutAsync(string refreshToken)
        => Client.PostAsJsonAsync("/api/identities/logout", new { refreshToken });

    private async Task<HttpResponseMessage> SwitchAsync(LoginTokens tokens, Guid profileId, string? refreshToken = null)
    {
        var client = Factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        return await client.PutAsJsonAsync("/api/users/profiles/switch", new { profileId, refreshToken = refreshToken ?? tokens.RefreshToken });
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static JwtSecurityToken Jwt(string token) => new JwtSecurityTokenHandler().ReadJwtToken(token);

    private static string UserIdOf(string accessToken) => Jwt(accessToken).Claims.Single(c => c.Type == "user_id").Value;

    private static async Task AssertInvalidRefreshAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("InvalidRefreshToken");
    }

    /// <summary>
    /// Runs the actions at the same instant.
    /// </summary>
    private static async Task<T[]> RaceAsync<T>(params Func<Task<T>>[] actions)
    {
        var gate = new TaskCompletionSource();
        var tasks = actions.Select(a => Task.Run(async () =>
        {
            await gate.Task;
            return await a();
        })).ToArray();

        gate.SetResult();
        return await Task.WhenAll(tasks);
    }

    #region Refresh

    [Fact]
    public async Task Refresh_Valid_ReturnsNewPair_RevokesOld()
    {
        var tokens = await LoginTokensAsync();

        var response = await RefreshAsync(tokens.RefreshToken);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        var newRefresh = body.GetProperty("refreshToken").GetString()!;
        body.GetProperty("accessToken").GetString().Should().NotBeNullOrEmpty();
        newRefresh.Should().NotBe(tokens.RefreshToken);
        Find(tokens.RefreshToken).IsActive.Should().BeFalse();
        Find(newRefresh).IsActive.Should().BeTrue();
        UserIdOf(body.GetProperty("accessToken").GetString()!).Should().Be(SeedIds.TestUser.Value.ToString());
    }

    [Fact]
    public async Task Refresh_RotatedToken_Returns401()
    {
        var tokens = await LoginTokensAsync();
        (await RefreshAsync(tokens.RefreshToken)).EnsureSuccessStatusCode();

        await AssertInvalidRefreshAsync(await RefreshAsync(tokens.RefreshToken));
    }

    [Fact]
    public async Task Refresh_UnknownToken_Returns401()
        => await AssertInvalidRefreshAsync(await RefreshAsync(Guid.NewGuid().ToString()));

    [Fact]
    public async Task Refresh_EmptyBody_Returns400()
    {
        var response = await RefreshAsync("");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Refresh_ExpiredToken_Returns401()
    {
        var tokens = await LoginTokensAsync();
        typeof(RefreshToken).GetProperty(nameof(RefreshToken.ExpiryTime))!.GetSetMethod(true)!
            .Invoke(Find(tokens.RefreshToken), [DateTime.UtcNow.AddMinutes(-1)]);

        await AssertInvalidRefreshAsync(await RefreshAsync(tokens.RefreshToken));
    }

    [Fact]
    public async Task Refresh_RevokedByLogout_Returns401()
    {
        var tokens = await LoginTokensAsync();
        await LogoutAsync(tokens.RefreshToken);

        await AssertInvalidRefreshAsync(await RefreshAsync(tokens.RefreshToken));
    }

    [Fact]
    public async Task Refresh_AfterSwitchProfile_KeepsSwitchedUserId()
    {
        var tokens = await LoginTokensAsync();
        var switched = await JsonAsync(await SwitchAsync(tokens, SeedIds.TestUserAlt.Value));

        var response = await RefreshAsync(switched.GetProperty("refreshToken").GetString()!);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        UserIdOf((await JsonAsync(response)).GetProperty("accessToken").GetString()!).Should().Be(SeedIds.TestUserAlt.Value.ToString());
    }

    [Fact]
    public async Task Refresh_DeletedProfile_Returns401()
    {
        var tokens = await LoginTokensAsync();
        var switched = await JsonAsync(await SwitchAsync(tokens, SeedIds.TestUserAlt.Value));
        MockDataStore.Users[SeedIds.TestUserAlt].Delete(isAccountDeletion: true);

        await AssertInvalidRefreshAsync(await RefreshAsync(switched.GetProperty("refreshToken").GetString()!));
    }

    [Fact]
    public async Task Refresh_DeletedAccount_Returns401()
    {
        var tokens = await LoginTokensAsync();
        TestAccount.Delete();
        TestAccount.ClearDomainEvents();

        await AssertInvalidRefreshAsync(await RefreshAsync(tokens.RefreshToken));
    }

    [Fact]
    public async Task Refresh_InactiveAccount_Returns401()
    {
        var tokens = await LoginTokensAsync();
        TestAccount.Deactivate();
        TestAccount.ClearDomainEvents();

        await AssertInvalidRefreshAsync(await RefreshAsync(tokens.RefreshToken));
    }

    #endregion

    #region Switch profile

    [Fact]
    public async Task SwitchProfile_RotatesToken()
    {
        var tokens = await LoginTokensAsync();

        var response = await SwitchAsync(tokens, SeedIds.TestUserAlt.Value);

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        Find(tokens.RefreshToken).IsActive.Should().BeFalse();
        Find(body.GetProperty("refreshToken").GetString()!).IsActive.Should().BeTrue();
        UserIdOf(body.GetProperty("accessToken").GetString()!).Should().Be(SeedIds.TestUserAlt.Value.ToString());
    }

    [Fact]
    public async Task SwitchProfile_OtherAccountsProfile_Returns403()
    {
        var tokens = await LoginTokensAsync();

        var response = await SwitchAsync(tokens, SeedIds.DemoUser.Value);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("ProfileNotOwned");
    }

    [Fact]
    public async Task SwitchProfile_OtherAccountsRefreshToken_Returns401()
    {
        var test = await LoginTokensAsync();
        var demo = await LoginTokensAsync("demo-device", Seed.DemoLogin);

        var response = await SwitchAsync(test, SeedIds.TestUserAlt.Value, demo.RefreshToken);

        await AssertInvalidRefreshAsync(response);
    }

    #endregion

    #region Access token

    [Fact]
    public async Task AccessToken_ExpClaim_MatchesConfig()
    {
        var tokens = await LoginTokensAsync();

        var lifetime = Jwt(tokens.AccessToken).ValidTo - DateTime.UtcNow;

        lifetime.Should().BeCloseTo(TimeSpan.FromMinutes(15), TimeSpan.FromMinutes(1));
    }

    [Fact]
    public async Task AccessToken_ExpClaim_FollowsConfiguredMinutes()
    {
        using var configured = Factory.WithWebHostBuilder(b => b.UseSetting("Jwt:AccessTokenMinutes", "30"));
        var client = configured.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });

        var tokens = await AuthHelper.RequestTokensAsync(client, Seed.TestLogin, Seed.Password);

        (Jwt(tokens.AccessToken).ValidTo - DateTime.UtcNow).Should().BeCloseTo(TimeSpan.FromMinutes(30), TimeSpan.FromMinutes(1));
    }

    #endregion

    #region Races (§4.3)

    [Fact]
    public async Task Refresh_ConcurrentSameToken_ExactlyOne200()
    {
        for (var i = 0; i < 50; i++)
        {
            var tokens = await LoginTokensAsync($"race{i}");

            var results = await RaceAsync(
                () => RefreshAsync(tokens.RefreshToken),
                () => RefreshAsync(tokens.RefreshToken),
                () => RefreshAsync(tokens.RefreshToken),
                () => RefreshAsync(tokens.RefreshToken));

            results.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1);
            results.Count(r => r.StatusCode == HttpStatusCode.Unauthorized).Should().Be(3);
        }
    }

    [Fact]
    public async Task RefreshAndLogout_SameToken_BothOrders_NoActiveTokenLeft()
    {
        for (var i = 0; i < 50; i++)
        {
            MockDataStore.ResetForTests();
            var tokens = await LoginTokensAsync($"rl{i}");

            var results = await RaceAsync(() => RefreshAsync(tokens.RefreshToken), () => LogoutAsync(tokens.RefreshToken));

            results[1].StatusCode.Should().Be(HttpStatusCode.NoContent, "logout is always 204");
            results[0].StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.Unauthorized);
            ActiveTokens(TestAccount).Should().Be(0, "logout ends the session it names, whichever order won");
        }
    }

    [Fact]
    public async Task Logout_RotatedToken_RevokesSuccessor()
    {
        var tokens = await LoginTokensAsync();
        var rotated = await JsonAsync(await RefreshAsync(tokens.RefreshToken));
        var second = await JsonAsync(await RefreshAsync(rotated.GetProperty("refreshToken").GetString()!));
        ActiveTokens(TestAccount).Should().Be(1);

        // Logging out the oldest (rotated) token ends the whole family
        (await LogoutAsync(tokens.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        ActiveTokens(TestAccount).Should().Be(0);
        await AssertInvalidRefreshAsync(await RefreshAsync(second.GetProperty("refreshToken").GetString()!));
    }

    [Fact]
    public async Task SwitchAndRefresh_SameToken_ExactlyOneRotation()
    {
        for (var i = 0; i < 50; i++)
        {
            MockDataStore.ResetForTests();
            var tokens = await LoginTokensAsync($"sw{i}");

            var results = await RaceAsync(
                () => SwitchAsync(tokens, SeedIds.TestUserAlt.Value),
                () => RefreshAsync(tokens.RefreshToken));

            results.Count(r => r.StatusCode == HttpStatusCode.OK).Should().Be(1);
            results.Single(r => r.StatusCode != HttpStatusCode.OK).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
            ActiveTokens(TestAccount).Should().Be(1);
        }
    }

    [Fact]
    public async Task ResetPasswordAndRefresh_NoActiveTokenSurvives()
    {
        for (var i = 0; i < 20; i++)
        {
            MockDataStore.ResetForTests();
            var tokens = await LoginTokensAsync($"rp{i}");
            TestAccount.GeneratePasswordResetToken(new YSocial.Infrastructure.Identity.BCryptPasswordHasher(4));
            var otp = TestAccount.DomainEvents.OfType<YSocial.Domain.Identities.Events.PasswordResetTokenGeneratedEvent>().Last().PlainToken;
            TestAccount.ClearDomainEvents();

            var results = await RaceAsync(
                () => RefreshAsync(tokens.RefreshToken),
                () => Client.PostAsJsonAsync("/api/identities/reset-password", new { loginId = Seed.TestLogin, otp, newPassword = "NewPassword123!" }));

            results[1].StatusCode.Should().Be(HttpStatusCode.NoContent);
            results[0].StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.Unauthorized);
            ActiveTokens(TestAccount).Should().Be(0, "no active token may survive a password reset");
        }
    }

    [Fact]
    public async Task LoginAndRefresh_AtCap_ActiveNeverAbove5()
    {
        var tokens = new List<LoginTokens>();
        for (var i = 0; i < 5; i++) tokens.Add(await LoginTokensAsync($"cap{i}"));

        var actions = new List<Func<Task<HttpResponseMessage>>>();
        actions.AddRange(tokens.Select(t => (Func<Task<HttpResponseMessage>>)(() => RefreshAsync(t.RefreshToken))));
        actions.AddRange(Enumerable.Range(0, 5).Select(i => (Func<Task<HttpResponseMessage>>)(async () =>
        {
            await LoginTokensAsync($"extra{i}");
            return new HttpResponseMessage(HttpStatusCode.OK);
        })));

        await RaceAsync(actions.ToArray());

        ActiveTokens(TestAccount).Should().BeLessThanOrEqualTo(5);
    }

    #endregion
}
