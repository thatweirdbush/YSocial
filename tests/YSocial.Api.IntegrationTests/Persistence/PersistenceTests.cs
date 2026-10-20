using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Notifications;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Persistence;

/// <summary>
/// What a real database adds over the old in-memory store: atomic saves, rollback of failed requests, durability.
/// </summary>
public class PersistenceTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Follow_SavesRelationCountersNotificationAndOutboxMessage_Together()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();

        Store.UserRelations.Should().ContainSingle();
        Store.Users[SeedIds.DemoUser].FollowersCount.Should().Be(1);
        Store.Users[SeedIds.TestUser].FollowingCount.Should().Be(1);
        Store.Notifications.Values.Should().ContainSingle(n => n.RecipientId == SeedIds.DemoUser && n.Type == NotificationType.NewFollow);
        Store.Messages.Should().ContainSingle("the outbox message is saved with the business change (transactional outbox)");
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task FailedRequest_SavesNothing(bool throwException)
    {
        var response = await Client.PostAsync($"/api/testprobe/fail-after-event/{throwException.ToString().ToLowerInvariant()}", null);

        response.IsSuccessStatusCode.Should().BeFalse();
        Store.Posts[SeedIds.TestPost].IsDeleted.Should().BeFalse("the handler soft-deleted the post, but the failed request must roll everything back");
    }

    [Fact]
    public async Task ConcurrencyConflict_Returns409_Conflict()
    {
        var response = await Client.GetAsync("/api/testprobe/throw/concurrency");

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("Conflict");
    }

    [Fact]
    public async Task Data_SurvivesHostRestart_IncludingSessions()
    {
        var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password);
        var authorized = Factory.CreateApiClient();
        authorized.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", tokens.AccessToken);
        var postId = (await (await authorized.PostAsJsonAsync("/api/posts", new { content = "survives restart" })).ReadJsonAsync()).AsId();

        // A brand new host (empty process memory) over the same database
        await using var restarted = new ApiFactory(Store.Database);
        using var client = restarted.CreateApiClient();

        (await client.GetAsync($"/api/posts/{postId}")).StatusCode.Should().Be(HttpStatusCode.OK);

        var refreshed = await client.PostAsJsonAsync("/api/identities/refresh-token", new { refreshToken = tokens.RefreshToken });
        refreshed.StatusCode.Should().Be(HttpStatusCode.OK, "refresh tokens live in the database, not in process memory");
    }

    [Fact]
    public async Task ForgotPassword_RacingRefreshOfSameAccount_NeverReturns409()
    {
        for (var i = 0; i < 20; i++)
        {
            Store.Reset();
            var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password, $"race{i}");

            var gate = new TaskCompletionSource();
            var refresh = Task.Run(async () =>
            {
                await gate.Task;
                return await Client.PostAsJsonAsync("/api/identities/refresh-token", new { refreshToken = tokens.RefreshToken });
            });
            var forgot = Task.Run(async () =>
            {
                await gate.Task;
                return await Client.PostAsJsonAsync("/api/identities/forgot-password", new { loginId = Seed.TestLogin });
            });

            gate.SetResult();
            var responses = await Task.WhenAll(refresh, forgot);

            responses[0].StatusCode.Should().Be(HttpStatusCode.OK, "forgot-password takes the same account session lock: no stale write");
            responses[1].StatusCode.Should().Be(HttpStatusCode.NoContent, "always 204, never a 409 that would reveal the account exists");
        }
    }

    [Fact]
    public async Task WrongOtp_AttemptCounter_IsSavedEvenThoughTheRequestFails()
    {
        var otp = AccountArrange.IssueOtp(SeedIds.TestAccount);
        var wrong = otp == "000000" ? "111111" : "000000";

        for (var i = 0; i < 2; i++)
        {
            var response = await Client.PostAsJsonAsync("/api/identities/reset-password", new { loginId = Seed.TestLogin, otp = wrong, newPassword = "NewPassword123!" });
            response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        }

        Store.Accounts[SeedIds.TestAccount].PasswordResetTokens.Single().AttemptCount.Should().Be(2);
    }
}
