using System.Net;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Discovery;

public class SuggestionsTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly UserId Test = SeedIds.TestUser;
    private static readonly UserId Demo = SeedIds.DemoUser;

    private static List<string> Usernames(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("username").GetString()!).ToList();

    private static async Task<JsonElement> GetAsync(HttpClient client, string query = "")
        => await (await client.GetAsync($"/api/users/suggestions{query}")).ReadJsonAsync();

    [Fact]
    public async Task Suggestions_ExcludeSelf_OwnOtherProfiles_AndOthersYouFollowOrRequested()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var requested = StoreData.AddUser("requested");
        var followed = StoreData.AddUser("followed");
        var stranger = StoreData.AddUser("stranger");
        StoreData.AddAccepted(Test, followed.Id);
        await test.PostAsync($"/api/users/{requested.Id.Value}/relations/follow", null);
        Store.Users.Update(requested.Id, u => u.UpdatePrivacySettings(new PrivacySettings(true, true, true)));
        await test.PostAsync($"/api/users/{requested.Id.Value}/relations/follow", null);

        var names = Usernames(await GetAsync(test, "?pageSize=50"));

        names.Should().Contain("stranger").And.NotContain(["followed", "requested", "test_user", "test_user_alt"]);
        names.Should().HaveCountGreaterThan(0);
    }

    [Fact]
    public async Task Suggestions_ExcludeBlockedMutedAndDeleted()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var blocked = StoreData.AddUser("blocked_one");
        var muted = StoreData.AddUser("muted_one");
        var deleted = StoreData.AddUser("deleted_one");
        var fine = StoreData.AddUser("fine_one");
        await test.PostAsync($"/api/users/{blocked.Id.Value}/blocks", null);
        await test.PutAsync($"/api/users/{muted.Id.Value}/relations/mute", null);
        Store.Users.Update(deleted.Id, u => u.Delete(isAccountDeletion: true));

        var names = Usernames(await GetAsync(test, "?pageSize=50"));

        names.Should().Contain("fine_one").And.NotContain(["blocked_one", "muted_one", "deleted_one"]);
    }

    [Fact]
    public async Task Suggestions_RankMutualsAboveRawPopularity()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var friend = StoreData.AddUser("friend");
        var viaFriend = StoreData.AddUser("via_friend");
        var popular = StoreData.AddUser("popular");
        StoreData.AddAccepted(Test, friend.Id);
        StoreData.AddAccepted(friend.Id, viaFriend.Id);
        foreach (var i in Enumerable.Range(0, 5))
        {
            StoreData.AddAccepted(StoreData.AddUser($"fan_{i}").Id, popular.Id);
        }

        var names = Usernames(await GetAsync(test, "?pageSize=50"));

        names.IndexOf("via_friend").Should().BeLessThan(names.IndexOf("popular"), "10 per mutual beats 5 followers");
    }

    [Fact]
    public async Task Suggestions_BlockedFolloweeDoesNotCountAsMutual()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var friend = StoreData.AddUser("friend");
        var viaFriend = StoreData.AddUser("via_friend");
        var popular = StoreData.AddUser("popular");
        StoreData.AddAccepted(Test, friend.Id);
        StoreData.AddAccepted(friend.Id, viaFriend.Id);
        StoreData.AddAccepted(StoreData.AddUser("fan_a").Id, popular.Id);
        StoreData.AddAccepted(StoreData.AddUser("fan_b").Id, popular.Id);
        await test.PostAsync($"/api/users/{friend.Id.Value}/blocks", null);

        var names = Usernames(await GetAsync(test, "?pageSize=50"));

        names.Should().NotContain("friend");
        names.IndexOf("popular").Should().BeLessThan(names.IndexOf("via_friend"), "the only mutual is blocked, so it no longer counts");
    }

    [Fact]
    public async Task Suggestions_Anonymous_RankByFollowersOnly_AndIncludeEveryoneDiscoverable()
    {
        var popular = StoreData.AddUser("popular");
        var quiet = StoreData.AddUser("quiet");
        StoreData.AddAccepted(StoreData.AddUser("fan_a").Id, popular.Id);
        StoreData.AddAccepted(StoreData.AddUser("fan_b").Id, popular.Id);
        Store.Users.Update(quiet.Id, u => u.UpdatePrivacySettings(new PrivacySettings(true, true, true)));

        var names = Usernames(await GetAsync(Client, "?pageSize=50"));

        names.IndexOf("popular").Should().Be(0);
        names.Should().Contain("quiet", "private profiles are suggested too (follow becomes a request)");
    }

    [Fact]
    public async Task Suggestions_EqualScores_NewestUserFirst_ThenIdAscending()
    {
        var older = StoreData.AddUser("older_one");
        await Task.Delay(15);
        var newer = StoreData.AddUser("newer_one");

        var names = Usernames(await GetAsync(Client, "?pageSize=50"));

        names.IndexOf("newer_one").Should().BeLessThan(names.IndexOf("older_one"));
    }

    [Fact]
    public async Task Suggestions_Paging_DefaultSize5_AndBounds()
    {
        foreach (var i in Enumerable.Range(0, 8)) StoreData.AddUser($"user_{i}");

        var first = await GetAsync(Client);
        var beyond = await GetAsync(Client, "?page=99");

        first.GetProperty("items").GetArrayLength().Should().Be(5);
        first.GetProperty("pageSize").GetInt32().Should().Be(5);
        first.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        beyond.GetProperty("items").GetArrayLength().Should().Be(0);
        beyond.GetProperty("totalCount").GetInt32().Should().BeGreaterThan(8);

        foreach (var bad in new[] { "?page=0", "?pageSize=0", "?pageSize=51" })
        {
            (await Client.GetAsync($"/api/users/suggestions{bad}")).StatusCode.Should().Be(HttpStatusCode.BadRequest, bad);
        }
    }

    [Fact]
    public async Task Suggestions_ItemsCarryViewerRelationFlags_LikeAnyProfileList()
    {
        var test = await LoginAsync(Seed.TestLogin);
        StoreData.AddUser("someone");

        var item = (await GetAsync(test, "?pageSize=50")).GetProperty("items").EnumerateArray().First(i => i.GetProperty("username").GetString() == "someone");

        item.GetProperty("followStatus").GetString().Should().Be("none");
        item.GetProperty("isFollowing").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task Suggestions_IgnoreClientSuppliedViewerIds()
    {
        var friend = StoreData.AddUser("friend");
        StoreData.AddAccepted(Demo, friend.Id);

        // Anonymous request pretending to be demo: still the anonymous list, friend of demo stays suggested
        var names = Usernames(await GetAsync(Client, $"?pageSize=50&viewerId={Demo.Value}&userId={Demo.Value}"));

        names.Should().Contain("friend");
    }
}
