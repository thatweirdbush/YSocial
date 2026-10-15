using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Notifications;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Relations;

public class FollowRequestTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const string Requests = "/api/users/me/follow-requests";

    private static string Respond(Guid requesterId) => $"/api/users/{requesterId}/relations/follow-request";

    private static void MakePrivate(UserId id)
        => MockDataStore.Users[id].UpdatePrivacySettings(new PrivacySettings(true, true, true));

    private static User AddUser(string username, string? displayName = null)
    {
        var user = User.Create(AccountId.New(), username, Country.Vietnam, isDefault: true);
        if (displayName is not null)
        {
            user.UpdateProfile(new UserProfileInfo(displayName, null, null, null, Gender.Unspecified, null, ProfileType.Personal));
        }

        user.ClearDomainEvents();
        MockDataStore.Users.TryAdd(user.Id, user);
        return user;
    }

    /// <summary>
    /// Pending request requester -> target, created directly in the store with a controllable timestamp.
    /// </summary>
    private static UserRelation AddRequest(User requester, UserId target, TimeSpan? age = null)
    {
        var relation = UserRelation.Create(requester.Id, target);
        relation.RequestFollow(isTargetPrivate: true);
        relation.ClearDomainEvents();
        typeof(UserRelation).GetProperty(nameof(UserRelation.UpdatedAt))!.GetSetMethod(true)!
            .Invoke(relation, [DateTime.UtcNow - (age ?? TimeSpan.Zero)]);
        MockDataStore.UserRelations.TryAdd(relation.Id, relation);
        return relation;
    }

    private static UserRelation AddAccepted(User follower, UserId target)
    {
        var relation = UserRelation.Create(follower.Id, target);
        relation.RequestFollow(isTargetPrivate: false);
        relation.ClearDomainEvents();
        MockDataStore.UserRelations.TryAdd(relation.Id, relation);
        return relation;
    }

    private static IReadOnlyList<string> Usernames(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("username").GetString()!).ToList();

    private async Task<HttpClient> DemoAsync()
    {
        MakePrivate(SeedIds.DemoUser);
        return await LoginAsync(Seed.DemoLogin);
    }

    #region Privacy toggle

    [Fact]
    public async Task Follow_PrivateTarget_Pending_NoCountsYet()
    {
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);

        (await response.ReadJsonAsync()).GetProperty("followStatus").GetString().Should().Be("pending");
        MockDataStore.Users[SeedIds.DemoUser].FollowersCount.Should().Be(0);
        MockDataStore.Notifications.Values.Should().ContainSingle(n => n.RecipientId == SeedIds.DemoUser && n.Type == NotificationType.FollowRequested);
    }

    [Fact]
    public async Task GoPublic_AcceptsOnlyPending_CountEqualsTransitions()
    {
        var demo = await DemoAsync();
        AddAccepted(AddUser("old_a"), SeedIds.DemoUser);
        AddAccepted(AddUser("old_b"), SeedIds.DemoUser);
        var pending = Enumerable.Range(1, 3).Select(i => AddRequest(AddUser($"req_{i}"), SeedIds.DemoUser)).ToList();

        var response = await demo.PutAsJsonAsync("/api/users/profiles/me/privacy", new { isPrivate = false });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.ReadJsonAsync()).GetProperty("acceptedCount").GetInt32().Should().Be(3);
        pending.Should().OnlyContain(r => r.FollowStatus == FollowStatus.Accepted);
        MockDataStore.Users[SeedIds.DemoUser].PrivacySettings.IsPrivateProfile.Should().BeFalse();
        MockDataStore.Users[SeedIds.DemoUser].FollowersCount.Should().Be(3, "events fire per accepted edge (old edges were seeded without events)");
    }

    [Fact]
    public async Task GoPublic_Twice_SecondReturns0()
    {
        var demo = await DemoAsync();
        AddRequest(AddUser("req_1"), SeedIds.DemoUser);

        var first = await demo.PutAsJsonAsync("/api/users/profiles/me/privacy", new { isPrivate = false });
        var second = await demo.PutAsJsonAsync("/api/users/profiles/me/privacy", new { isPrivate = false });

        (await first.ReadJsonAsync()).GetProperty("acceptedCount").GetInt32().Should().Be(1);
        (await second.ReadJsonAsync()).GetProperty("acceptedCount").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task GoPrivate_KeepsAcceptedFollowers_ReturnsZero()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var follower = AddAccepted(AddUser("follower"), SeedIds.DemoUser);

        var response = await demo.PutAsJsonAsync("/api/users/profiles/me/privacy", new { isPrivate = true });

        (await response.ReadJsonAsync()).GetProperty("acceptedCount").GetInt32().Should().Be(0);
        follower.FollowStatus.Should().Be(FollowStatus.Accepted);
        follower.IsDeleted.Should().BeFalse();
        MockDataStore.Users[SeedIds.DemoUser].PrivacySettings.IsPrivateProfile.Should().BeTrue();
    }

    [Fact]
    public async Task GoPublic_NotifiesRequesters()
    {
        var demo = await DemoAsync();
        var requester = AddUser("req_1");
        AddRequest(requester, SeedIds.DemoUser);

        await demo.PutAsJsonAsync("/api/users/profiles/me/privacy", new { isPrivate = false });

        MockDataStore.Notifications.Values.Should().ContainSingle(n => n.RecipientId == requester.Id && n.Type == NotificationType.FollowAccepted);
    }

    [Fact]
    public async Task Privacy_Anonymous_401()
    {
        var response = await Client.PutAsJsonAsync("/api/users/profiles/me/privacy", new { isPrivate = true });

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    #endregion

    #region Respond

    [Fact]
    public async Task Accept_MakesAccepted_IncrementsCounts()
    {
        var demo = await DemoAsync();
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);

        var response = await demo.PostAsJsonAsync(Respond(SeedIds.TestUser.Value), new { decision = "accept" });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        MockDataStore.UserRelations.Values.Single().FollowStatus.Should().Be(FollowStatus.Accepted);
        MockDataStore.Users[SeedIds.DemoUser].FollowersCount.Should().Be(1);
        MockDataStore.Users[SeedIds.TestUser].FollowingCount.Should().Be(1);
        MockDataStore.Notifications.Values.Should().Contain(n => n.RecipientId == SeedIds.TestUser && n.Type == NotificationType.FollowAccepted,
            "accepting notifies the requester");
    }

    [Fact]
    public async Task Decline_RemovesEdge_NoCountChange()
    {
        var demo = await DemoAsync();
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);

        var response = await demo.PostAsJsonAsync(Respond(SeedIds.TestUser.Value), new { decision = "decline" });

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        MockDataStore.UserRelations.Values.Single().IsDeleted.Should().BeTrue();
        MockDataStore.Users[SeedIds.DemoUser].FollowersCount.Should().Be(0);
        (await (await test.GetAsync($"/api/users/{SeedIds.DemoUser.Value}")).ReadJsonAsync()).GetProperty("followStatus").GetString().Should().Be("none");
    }

    [Fact]
    public async Task Decline_ThenRequesterCanRequestAgain()
    {
        var demo = await DemoAsync();
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);
        await demo.PostAsJsonAsync(Respond(SeedIds.TestUser.Value), new { decision = "decline" });

        var again = await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);

        (await again.ReadJsonAsync()).GetProperty("followStatus").GetString().Should().Be("pending");
    }

    [Fact]
    public async Task RespondMissingRequest_404()
    {
        var demo = await DemoAsync();

        (await demo.PostAsJsonAsync(Respond(SeedIds.TestUser.Value), new { decision = "accept" })).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await demo.PostAsJsonAsync(Respond(Guid.NewGuid()), new { decision = "decline" })).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Respond_AlreadyAcceptedFollower_404()
    {
        var demo = await DemoAsync();
        AddAccepted(AddUser("follower"), SeedIds.DemoUser);
        var followerId = MockDataStore.UserRelations.Values.Single().ObserverId.Value;

        (await demo.PostAsJsonAsync(Respond(followerId), new { decision = "decline" })).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Theory]
    [InlineData("maybe")]
    [InlineData("")]
    public async Task Respond_InvalidDecision_400(string decision)
    {
        var demo = await DemoAsync();

        (await demo.PostAsJsonAsync(Respond(SeedIds.TestUser.Value), new { decision })).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Respond_Anonymous_401()
    {
        (await Client.PostAsJsonAsync(Respond(SeedIds.TestUser.Value), new { decision = "accept" })).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Respond_BlockedRequester_404()
    {
        var demo = await DemoAsync();
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);
        await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/blocks", null);

        (await demo.PostAsJsonAsync(Respond(SeedIds.TestUser.Value), new { decision = "accept" })).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    #endregion

    #region List & count

    [Fact]
    public async Task Requests_RequireAuth()
    {
        (await Client.GetAsync(Requests)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client.GetAsync($"{Requests}/count")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Requests_DefaultPageSize20_NewestFirst()
    {
        var demo = await DemoAsync();
        for (var i = 1; i <= 25; i++) AddRequest(AddUser($"req_{i:00}"), SeedIds.DemoUser, TimeSpan.FromMinutes(100 - i));

        var first = await (await demo.GetAsync(Requests)).ReadJsonAsync();
        var second = await (await demo.GetAsync($"{Requests}?page=2")).ReadJsonAsync();

        first.GetProperty("pageSize").GetInt32().Should().Be(20);
        first.GetProperty("totalCount").GetInt32().Should().Be(25);
        first.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        first.GetProperty("locked").GetBoolean().Should().BeFalse();
        Usernames(first).First().Should().Be("req_25");
        Usernames(first).Should().HaveCount(20).And.BeInDescendingOrder();
        Usernames(second).Should().Equal("req_05", "req_04", "req_03", "req_02", "req_01");
        first.GetProperty("items")[0].EnumerateObject().Select(p => p.Name).Should().Contain(["followStatus", "followersCount"]);
    }

    [Fact]
    public async Task Requests_TieOnTimestamp_BreaksByRequesterId()
    {
        var demo = await DemoAsync();
        var users = Enumerable.Range(1, 4).Select(i => AddUser($"same_{i}")).ToList();
        var when = DateTime.UtcNow.AddMinutes(-5);
        foreach (var user in users)
        {
            var edge = AddRequest(user, SeedIds.DemoUser);
            typeof(UserRelation).GetProperty(nameof(UserRelation.UpdatedAt))!.GetSetMethod(true)!.Invoke(edge, [when]);
        }

        var first = Usernames(await (await demo.GetAsync(Requests)).ReadJsonAsync());
        var second = Usernames(await (await demo.GetAsync(Requests)).ReadJsonAsync());

        first.Should().Equal(users.OrderBy(u => u.Id.Value).Select(u => u.Username));
        second.Should().Equal(first, "ordering is deterministic");
    }

    [Fact]
    public async Task Requests_PageSize51_400()
    {
        var demo = await DemoAsync();

        (await demo.GetAsync($"{Requests}?pageSize=51")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await demo.GetAsync($"{Requests}?page=0")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Requests_Query_MatchesUsernameOrDisplayName_DiacriticsInsensitive()
    {
        var demo = await DemoAsync();
        AddRequest(AddUser("an_nguyen", "Nguyễn Văn An"), SeedIds.DemoUser, TimeSpan.FromMinutes(3));
        AddRequest(AddUser("lan.pham", "Lan Phạm"), SeedIds.DemoUser, TimeSpan.FromMinutes(2));
        AddRequest(AddUser("dung", "Đặng Dũng"), SeedIds.DemoUser, TimeSpan.FromMinutes(1));

        async Task<IReadOnlyList<string>> Search(string q) => Usernames(await (await demo.GetAsync($"{Requests}?query={Uri.EscapeDataString(q)}")).ReadJsonAsync());

        (await Search("nguyen")).Should().Equal("an_nguyen");
        (await Search("NGUYỄN")).Should().Equal("an_nguyen");
        (await Search("pham")).Should().Equal("lan.pham");
        (await Search("dang")).Should().Equal("dung");
        (await Search("LAN")).Should().Equal("lan.pham");
        (await Search("  văn  ")).Should().Equal("an_nguyen");
        (await Search("an")).Should().BeEquivalentTo(["an_nguyen", "lan.pham", "dung"], "substring: 'dang' contains 'an'");
        (await Search("zzz")).Should().BeEmpty();
        (await Search("")).Should().HaveCount(3);
    }

    [Fact]
    public async Task Requests_Query51Chars_400()
    {
        var demo = await DemoAsync();

        (await demo.GetAsync($"{Requests}?query={new string('a', 51)}")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await demo.GetAsync($"{Requests}?query={new string('a', 50)}")).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Requests_DeletedRequester_ExcludedFromListAndCount()
    {
        var demo = await DemoAsync();
        AddRequest(AddUser("alive"), SeedIds.DemoUser);
        var gone = AddUser("gone");
        AddRequest(gone, SeedIds.DemoUser);
        gone.Delete(isAccountDeletion: true);

        var list = await (await demo.GetAsync(Requests)).ReadJsonAsync();
        var count = await (await demo.GetAsync($"{Requests}/count")).ReadJsonAsync();

        Usernames(list).Should().Equal("alive");
        list.GetProperty("totalCount").GetInt32().Should().Be(1);
        count.GetProperty("count").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Requests_BlockedRequester_ExcludedFromListAndCount()
    {
        var demo = await DemoAsync();
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);
        AddRequest(AddUser("other"), SeedIds.DemoUser);
        (await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        var list = await (await demo.GetAsync(Requests)).ReadJsonAsync();
        var count = await (await demo.GetAsync($"{Requests}/count")).ReadJsonAsync();

        Usernames(list).Should().Equal("other");
        count.GetProperty("count").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Requests_OnlyOwnPendingRequests()
    {
        var demo = await DemoAsync();
        AddRequest(AddUser("for_demo"), SeedIds.DemoUser);
        AddRequest(AddUser("for_test"), SeedIds.TestUser);
        AddAccepted(AddUser("accepted"), SeedIds.DemoUser);

        var list = await (await demo.GetAsync(Requests)).ReadJsonAsync();

        Usernames(list).Should().Equal("for_demo");
    }

    #endregion
}
