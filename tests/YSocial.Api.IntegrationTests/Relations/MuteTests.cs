using FluentAssertions;
using System.Net;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.UserRelations;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Relations;

public class MuteTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly Guid Test = SeedIds.TestUser.Value;
    private static readonly Guid Demo = SeedIds.DemoUser.Value;

    private static string MuteRoute(Guid id) => $"/api/users/{id}/relations/mute";

    private static string FollowRoute(Guid id) => $"/api/users/{id}/relations/follow";

    private static UserRelation? Edge(Guid observer, Guid target)
        => MockDataStore.UserRelations.Values.SingleOrDefault(r => r.ObserverId.Value == observer && r.TargetId.Value == target);

    private static IReadOnlyList<string> Usernames(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("username").GetString()!).ToList();

    [Fact]
    public async Task PutMute_Twice_Idempotent_SingleEdge()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var first = await test.PutAsync(MuteRoute(Demo), null);
        var mutedAt = Edge(Test, Demo)!.MutedAt;
        var second = await test.PutAsync(MuteRoute(Demo), null);

        first.StatusCode.Should().Be(HttpStatusCode.NoContent);
        second.StatusCode.Should().Be(HttpStatusCode.NoContent);
        MockDataStore.UserRelations.Values.Count(r => r.ObserverId.Value == Test && r.TargetId.Value == Demo).Should().Be(1);
        Edge(Test, Demo)!.IsMuted.Should().BeTrue();
        Edge(Test, Demo)!.MutedAt.Should().Be(mutedAt);
    }

    [Fact]
    public async Task PutMute_WithoutFollow_CreatesNoneEdge_NoFollowCounts()
    {
        var test = await LoginAsync(Seed.TestLogin);

        await test.PutAsync(MuteRoute(Demo), null);

        var edge = Edge(Test, Demo)!;
        edge.FollowStatus.Should().Be(FollowStatus.None);
        edge.IsDeleted.Should().BeFalse();
        var profile = await (await test.GetAsync($"/api/users/{Demo}")).ReadJsonAsync();
        profile.GetProperty("followersCount").GetInt32().Should().Be(0);
        profile.GetProperty("followStatus").GetString().Should().Be("none");
        profile.GetProperty("isMuted").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task FollowAfterMute_StillFollows_KeepsMute()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync(MuteRoute(Demo), null);

        var follow = await test.PostAsync(FollowRoute(Demo), null);

        (await follow.ReadJsonAsync()).GetProperty("followStatus").GetString().Should().Be("accepted");
        Edge(Test, Demo)!.IsMuted.Should().BeTrue();
    }

    [Fact]
    public async Task MuteFollowedUser_KeepsFollow()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync(FollowRoute(Demo), null);

        await test.PutAsync(MuteRoute(Demo), null);

        var profile = await (await test.GetAsync($"/api/users/{Demo}")).ReadJsonAsync();
        profile.GetProperty("followStatus").GetString().Should().Be("accepted");
        profile.GetProperty("followersCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task MuteDoesNotResurrectUnfollowedEdge()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync(FollowRoute(Demo), null);
        await test.DeleteAsync(FollowRoute(Demo));

        await test.PutAsync(MuteRoute(Demo), null);

        Edge(Test, Demo)!.IsDeleted.Should().BeTrue();
        var profile = await (await test.GetAsync($"/api/users/{Demo}")).ReadJsonAsync();
        profile.GetProperty("followStatus").GetString().Should().Be("none");
        profile.GetProperty("isMuted").GetBoolean().Should().BeTrue();
        var followers = await (await test.GetAsync($"/api/users/{Demo}/followers")).ReadJsonAsync();
        followers.GetProperty("totalCount").GetInt32().Should().Be(0);
    }

    [Fact]
    public async Task Mute_DoesNotTouchFollowOrderingTimestamp()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var edge = StoreData.AddAccepted(SeedIds.TestUser, SeedIds.DemoUser);
        var updatedAt = edge.UpdatedAt;

        await test.PutAsync(MuteRoute(Demo), null);

        edge.IsMuted.Should().BeTrue();
        edge.UpdatedAt.Should().Be(updatedAt, "follow lists order by UpdatedAt");
    }

    [Fact]
    public async Task DeleteMute_NotMuted_204_NoEdgeCreated()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.DeleteAsync(MuteRoute(Demo));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Edge(Test, Demo).Should().BeNull();
    }

    [Fact]
    public async Task DeleteMute_Muted_ClearsFlag()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync(MuteRoute(Demo), null);

        var response = await test.DeleteAsync(MuteRoute(Demo));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        Edge(Test, Demo)!.IsMuted.Should().BeFalse();
    }

    [Fact]
    public async Task MuteSelf_400_CannotMuteSelf()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsync(MuteRoute(Test), null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("CannotMuteSelf");
    }

    [Fact]
    public async Task MuteUnknownUser_404()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync(MuteRoute(Guid.NewGuid()), null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task MuteBlockedEitherWay_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);

        await demo.PostAsync($"/api/users/{Test}/blocks", null);
        (await test.PutAsync(MuteRoute(Demo), null)).StatusCode.Should().Be(HttpStatusCode.NotFound);

        await demo.DeleteAsync($"/api/users/{Test}/blocks");
        await test.PostAsync($"/api/users/{Demo}/blocks", null);
        (await test.PutAsync(MuteRoute(Demo), null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Mute_RequiresAuth()
    {
        (await Client.PutAsync(MuteRoute(Demo), null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client.DeleteAsync(MuteRoute(Demo))).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await Client.GetAsync("/api/users/me/mutes")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task Mutes_Paged_NewestMutedFirst_IsMutedTrue()
    {
        var test = await LoginAsync(Seed.TestLogin);
        foreach (var user in Enumerable.Range(1, 3).Select(i => StoreData.AddUser($"muted_{i}")))
        {
            await test.PutAsync(MuteRoute(user.Id.Value), null);
            await Task.Delay(5);
        }

        var page = await (await test.GetAsync("/api/users/me/mutes?page=1&pageSize=2")).ReadJsonAsync();

        Usernames(page).Should().Equal("muted_3", "muted_2");
        page.GetProperty("totalCount").GetInt32().Should().Be(3);
        page.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        page.GetProperty("items").EnumerateArray().Should().OnlyContain(i => i.GetProperty("isMuted").GetBoolean());
    }

    [Fact]
    public async Task Mutes_ExcludesBlockedAndDeletedUsers_BeforePaging()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var kept = StoreData.AddUser("kept");
        var blocked = StoreData.AddUser("blocked_one");
        var deleted = StoreData.AddUser("deleted_one", isDefault: false);
        foreach (var user in new[] { kept, blocked, deleted })
        {
            await test.PutAsync(MuteRoute(user.Id.Value), null);
        }

        await test.PostAsync($"/api/users/{blocked.Id.Value}/blocks", null);
        deleted.Delete();

        var page = await (await test.GetAsync("/api/users/me/mutes")).ReadJsonAsync();

        Usernames(page).Should().Equal("kept");
        page.GetProperty("totalCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Mutes_Query_Filters_BadInputIs400()
    {
        var test = await LoginAsync(Seed.TestLogin);
        foreach (var name in new[] { "alpha", "beta" })
        {
            await test.PutAsync(MuteRoute(StoreData.AddUser(name).Id.Value), null);
        }

        var page = await (await test.GetAsync("/api/users/me/mutes?query=alp")).ReadJsonAsync();

        Usernames(page).Should().Equal("alpha");
        (await test.GetAsync("/api/users/me/mutes?pageSize=51")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await test.GetAsync($"/api/users/me/mutes?query={new string('a', 51)}")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task RelationSets_MutedIncludesMutedUser()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync(MuteRoute(Demo), null);

        var sets = await (await test.GetAsync("/api/users/me/relation-sets")).ReadJsonAsync();

        sets.GetProperty("muted").EnumerateArray().Select(e => e.GetGuid()).Should().Equal(Demo);
    }
}
