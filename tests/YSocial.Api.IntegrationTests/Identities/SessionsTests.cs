using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Application.Abstractions.Identity;
using YSocial.Domain.Identities;
using YSocial.Infrastructure.Identity;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Identities;

public class SessionsTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string Sessions = "/api/identities/sessions";

    private static Account TestAccount => Store.Accounts[SeedIds.TestAccount];

    private static string[] SessionKeys => ["id", "userAgent", "profileUsername", "createdAt", "lastTokenIssuedAt", "isCurrent"];

    #region Helpers

    private HttpClient As(string accessToken)
    {
        var client = Factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
        return client;
    }

    private Task<LoginTokens> LoginTokensAsync(string deviceId, string loginId = Seed.TestLogin, string? userAgent = null)
    {
        var client = Factory.CreateApiClient();
        if (userAgent is not null)
        {
            client.DefaultRequestHeaders.UserAgent.ParseAdd(userAgent);
        }

        return AuthHelper.RequestTokensAsync(client, loginId, Seed.Password, deviceId);
    }

    private Task<HttpResponseMessage> RefreshAsync(string refreshToken)
        => Client.PostAsJsonAsync("/api/identities/refresh-token", new { refreshToken });

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static async Task<List<JsonElement>> ListAsync(HttpClient client)
    {
        var response = await client.GetAsync(Sessions);
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return (await JsonAsync(response)).EnumerateArray().ToList();
    }

    private static Task<HttpResponseMessage> RevokeAsync(HttpClient client, Guid id) => client.DeleteAsync($"{Sessions}/{id}");

    private static async Task<Guid> CurrentIdAsync(HttpClient client)
        => (await ListAsync(client)).Single(s => s.GetProperty("isCurrent").GetBoolean()).GetProperty("id").GetGuid();

    private static int ActiveIn(string deviceId) => TestAccount.RefreshTokens.Count(t => t.DeviceId == deviceId && t.IsActive);

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be(code);
    }

    #endregion

    #region List

    [Fact]
    public async Task List_AfterTwoLogins_TwoSessions_CurrentFlaggedByAccessToken()
    {
        var a = await LoginTokensAsync("a");
        var b = await LoginTokensAsync("b");

        var asA = await ListAsync(As(a.AccessToken));
        var asB = await ListAsync(As(b.AccessToken));

        asA.Should().HaveCount(2);
        asA[0].EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(SessionKeys);
        asA.Count(s => s.GetProperty("isCurrent").GetBoolean()).Should().Be(1);
        asA.Single(s => s.GetProperty("isCurrent").GetBoolean()).GetProperty("profileUsername").GetString().Should().Be("test_user");
        asB.Count(s => s.GetProperty("isCurrent").GetBoolean()).Should().Be(1);
        asA.Single(s => s.GetProperty("isCurrent").GetBoolean()).GetProperty("id").GetGuid()
            .Should().NotBe(asB.Single(s => s.GetProperty("isCurrent").GetBoolean()).GetProperty("id").GetGuid());
    }

    [Fact]
    public async Task List_AfterRefresh_IsCurrentFollowsRotation()
    {
        var first = await LoginTokensAsync("a");
        var before = await CurrentIdAsync(As(first.AccessToken));

        var refreshed = await JsonAsync(await RefreshAsync(first.RefreshToken));
        var newAccess = refreshed.GetProperty("accessToken").GetString()!;

        var withNew = await ListAsync(As(newAccess));
        var withOld = await ListAsync(As(first.AccessToken));

        withNew.Should().ContainSingle();
        withNew[0].GetProperty("isCurrent").GetBoolean().Should().BeTrue();
        withNew[0].GetProperty("id").GetGuid().Should().NotBe(before, "the id is the active head, which rotated");
        withOld.Should().ContainSingle().Which.GetProperty("isCurrent").GetBoolean().Should().BeTrue("the old sid still resolves to its family");
    }

    [Fact]
    public async Task List_CapturesUserAgentHeader()
    {
        var tokens = await LoginTokensAsync("a", userAgent: "TestAgent/1.0");
        var rotated = await JsonAsync(await RefreshAsync(tokens.RefreshToken));

        var list = await ListAsync(As(rotated.GetProperty("accessToken").GetString()!));

        list.Should().ContainSingle().Which.GetProperty("userAgent").GetString().Should().Be("TestAgent/1.0", "rotation copies it");
    }

    [Fact]
    public async Task List_Anonymous_401()
        => (await Client.GetAsync(Sessions)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

    [Fact]
    public async Task List_OrderAndTimestamps_MatchDomain()
    {
        var a = await LoginTokensAsync("a");
        await Task.Delay(30);
        var b = await LoginTokensAsync("b");

        var first = await ListAsync(As(a.AccessToken));
        first.Select(s => s.GetProperty("id").GetGuid())
            .Should().Equal(TestAccount.GetSessions().Select(s => s.HeadId.Value), "DTO order is the domain order");
        first[0].GetProperty("id").GetGuid().Should().Be(TestAccount.RefreshTokens.Single(t => t.Token == b.RefreshToken).Id.Value);

        var bBefore = first[0];
        await Task.Delay(30);
        await RefreshAsync(b.RefreshToken);
        var after = (await ListAsync(As(a.AccessToken))).Single(s => s.GetProperty("createdAt").GetDateTime() == bBefore.GetProperty("createdAt").GetDateTime());

        after.GetProperty("lastTokenIssuedAt").GetDateTime().Should().BeAfter(bBefore.GetProperty("lastTokenIssuedAt").GetDateTime());
        after.GetProperty("createdAt").GetDateTime().Should().Be(bBefore.GetProperty("createdAt").GetDateTime());
    }

    #endregion

    #region Revoke

    [Fact]
    public async Task Revoke_OtherSession_ItsRefreshReturns401_ItsAccessTokenStillWorksUntilExpiry()
    {
        var a = await LoginTokensAsync("a");
        var b = await LoginTokensAsync("b");
        var bId = await CurrentIdAsync(As(b.AccessToken));

        var revoked = await RevokeAsync(As(a.AccessToken), bId);

        revoked.StatusCode.Should().Be(HttpStatusCode.NoContent);
        await AssertProblemAsync(await RefreshAsync(b.RefreshToken), HttpStatusCode.Unauthorized, "InvalidRefreshToken");
        (await As(b.AccessToken).GetAsync("/api/users/me")).StatusCode.Should().Be(HttpStatusCode.OK, "an access token lives until expiry (D6)");
        (await ListAsync(As(a.AccessToken))).Should().ContainSingle();
    }

    [Fact]
    public async Task Revoke_StaleRotatedId_RevokesFamily()
    {
        var a = await LoginTokensAsync("a");
        var b = await LoginTokensAsync("b");
        var staleId = await CurrentIdAsync(As(b.AccessToken));
        var rotated = await JsonAsync(await RefreshAsync(b.RefreshToken));

        (await RevokeAsync(As(a.AccessToken), staleId)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        await AssertProblemAsync(await RefreshAsync(rotated.GetProperty("refreshToken").GetString()!), HttpStatusCode.Unauthorized, "InvalidRefreshToken");
        ActiveIn("b").Should().Be(0);
    }

    [Fact]
    public async Task Revoke_EndedFamily_204()
    {
        var a = await LoginTokensAsync("a");
        var b = await LoginTokensAsync("b");
        var bId = await CurrentIdAsync(As(b.AccessToken));
        await RevokeAsync(As(a.AccessToken), bId);

        (await RevokeAsync(As(a.AccessToken), bId)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Revoke_ForeignAccountId_404()
    {
        var test = await LoginTokensAsync("a");
        var demo = await LoginTokensAsync("demo-device", Seed.DemoLogin);
        var demoId = await CurrentIdAsync(As(demo.AccessToken));

        var response = await RevokeAsync(As(test.AccessToken), demoId);

        await AssertProblemAsync(response, HttpStatusCode.NotFound, "NotFound");
        (await RefreshAsync(demo.RefreshToken)).StatusCode.Should().Be(HttpStatusCode.OK, "the foreign session is untouched");
    }

    [Fact]
    public async Task Revoke_UnknownId_404()
    {
        var a = await LoginTokensAsync("a");

        await AssertProblemAsync(await RevokeAsync(As(a.AccessToken), Guid.NewGuid()), HttpStatusCode.NotFound, "NotFound");
    }

    [Fact]
    public async Task Revoke_CurrentSession_OwnRefresh401()
    {
        var a = await LoginTokensAsync("a");
        var client = As(a.AccessToken);

        (await RevokeAsync(client, await CurrentIdAsync(client))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        await AssertProblemAsync(await RefreshAsync(a.RefreshToken), HttpStatusCode.Unauthorized, "InvalidRefreshToken");
    }

    [Fact]
    public async Task Revoke_Anonymous_401()
        => (await Client.DeleteAsync($"{Sessions}/{Guid.NewGuid()}")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);

    #endregion

    #region Race & order

    [Fact]
    public async Task Revoke_ThenRefreshSameToken_Returns401_ZeroActive()
    {
        var a = await LoginTokensAsync("a");
        var client = As(a.AccessToken);

        (await RevokeAsync(client, await CurrentIdAsync(client))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var refresh = await RefreshAsync(a.RefreshToken);

        await AssertProblemAsync(refresh, HttpStatusCode.Unauthorized, "InvalidRefreshToken");
        ActiveIn("a").Should().Be(0);
    }

    [Fact]
    public async Task Refresh_ThenRevokeWithStaleId_RevokesNewHead_ZeroActive()
    {
        var a = await LoginTokensAsync("a");
        var client = As(a.AccessToken);
        var staleId = await CurrentIdAsync(client);
        var rotated = await JsonAsync(await RefreshAsync(a.RefreshToken));

        (await RevokeAsync(client, staleId)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        await AssertProblemAsync(await RefreshAsync(rotated.GetProperty("refreshToken").GetString()!), HttpStatusCode.Unauthorized, "InvalidRefreshToken");
        ActiveIn("a").Should().Be(0);
    }

    [Fact]
    public async Task Revoke_WaitsForHeldAccountLock()
    {
        using var factory = new SignalingFactory(Store.Database);
        var anonymous = factory.CreateApiClient();
        var tokens = await AuthHelper.RequestTokensAsync(anonymous, Seed.TestLogin, Seed.Password, "a");
        var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        var id = await CurrentIdAsync(client);
        var probe = factory.Services.GetRequiredService<SignalingLock>();

        var held = await probe.Inner.AcquireAsync(SeedIds.TestAccount);
        var arrived = probe.Arm();
        var request = RevokeAsync(client, id);

        await arrived.WaitAsync(TimeSpan.FromSeconds(5));
        await Task.Delay(100);
        request.IsCompleted.Should().BeFalse("the handler must wait for the account lock held elsewhere");

        await held.DisposeAsync();
        (await request.WaitAsync(TimeSpan.FromSeconds(5))).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task RevokeVsRefresh_SameFamily_50xBarrier_NoActiveTokenSurvives()
    {
        for (var i = 0; i < 50; i++)
        {
            var device = $"race{i}";
            var tokens = await LoginTokensAsync(device);
            var client = As(tokens.AccessToken);
            var id = await CurrentIdAsync(client);
            var gate = new TaskCompletionSource();

            var refresh = Task.Run(async () => { await gate.Task; return await RefreshAsync(tokens.RefreshToken); });
            var revoke = Task.Run(async () => { await gate.Task; return await RevokeAsync(client, id); });
            gate.SetResult();
            var responses = await Task.WhenAll(refresh, revoke);

            responses[0].StatusCode.Should().BeOneOf(new[] { HttpStatusCode.OK, HttpStatusCode.Unauthorized }, $"iteration {i}");
            responses[1].StatusCode.Should().Be(HttpStatusCode.NoContent, $"iteration {i}");
            ActiveIn(device).Should().Be(0, $"iteration {i}: revoke must leave no active token of the family");
        }
    }

    [Fact]
    public async Task Switch_ReplayedRefreshToken_Returns401_NoSecondRotation()
    {
        var tokens = await LoginTokensAsync("a");
        var client = As(tokens.AccessToken);
        var body = new { profileId = SeedIds.TestUserAlt.Value, refreshToken = tokens.RefreshToken };

        (await client.PutAsJsonAsync("/api/users/profiles/switch", body)).StatusCode.Should().Be(HttpStatusCode.OK);
        var replay = await client.PutAsJsonAsync("/api/users/profiles/switch", body);

        await AssertProblemAsync(replay, HttpStatusCode.Unauthorized, "InvalidRefreshToken");
        TestAccount.RefreshTokens.Count(t => t.DeviceId == "a").Should().Be(2, "original + exactly one successor");
        ActiveIn("a").Should().Be(1);
    }

    #endregion

    private sealed class SignalingFactory(SqliteTestDatabase database) : ApiFactory(database)
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.ConfigureServices(services =>
            {
                services.Remove(services.Single(d => d.ServiceType == typeof(IAccountSessionLock)));
                services.AddSingleton<SignalingLock>();
                services.AddSingleton<IAccountSessionLock>(sp => sp.GetRequiredService<SignalingLock>());
            });
        }
    }

    /// <summary>
    /// Real lock + a signal raised when someone asks for it (proves the request reached the handler).
    /// </summary>
    private sealed class SignalingLock : IAccountSessionLock
    {
        private TaskCompletionSource _arrived = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public AccountSessionLock Inner { get; } = new();

        public Task Arm()
        {
            _arrived = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            return _arrived.Task;
        }

        public Task<IAsyncDisposable> AcquireAsync(AccountId accountId, CancellationToken cancellationToken = default)
        {
            _arrived.TrySetResult();
            return Inner.AcquireAsync(accountId, cancellationToken);
        }
    }
}
