using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Relations;

public class FollowListTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static string Followers(Guid id, string qs = "") => $"/api/users/{id}/followers{qs}";

    private static string Following(Guid id, string qs = "") => $"/api/users/{id}/following{qs}";

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

    private static UserRelation AddEdge(UserId observer, UserId target, bool accepted = true)
    {
        var relation = UserRelation.Create(observer, target);
        relation.RequestFollow(isTargetPrivate: !accepted);
        relation.ClearDomainEvents();
        MockDataStore.UserRelations.TryAdd(relation.Id, relation);
        return relation;
    }

    private static void AddBlock(UserId observer, UserId target)
    {
        var block = UserBlock.Create(observer, target);
        block.ClearDomainEvents();
        MockDataStore.UserBlocks.TryAdd(block.Id, block);
    }

    private static IReadOnlyList<string> Usernames(JsonElement page)
        => page.GetProperty("items").EnumerateArray().Select(i => i.GetProperty("username").GetString()!).ToList();

    #region Followers / following

    [Fact]
    public async Task Followers_ExcludesPendingAndBlockedUsers()
    {
        var accepted = AddUser("acc");
        var pending = AddUser("pen");
        var blocked = AddUser("blk");
        var deleted = AddUser("del");
        AddEdge(accepted.Id, SeedIds.DemoUser);
        AddEdge(pending.Id, SeedIds.DemoUser, accepted: false);
        AddEdge(blocked.Id, SeedIds.DemoUser);
        AddEdge(deleted.Id, SeedIds.DemoUser);
        deleted.Delete(isAccountDeletion: true);
        var test = await LoginAsync(Seed.TestLogin);
        AddBlock(SeedIds.TestUser, blocked.Id);

        var page = await test.GetFromJsonAsync<JsonElement>(Followers(SeedIds.DemoUser.Value));

        Usernames(page).Should().BeEquivalentTo("acc");
        page.GetProperty("totalCount").GetInt32().Should().Be(1);
        page.GetProperty("locked").GetBoolean().Should().BeFalse();
        page.GetProperty("pageSize").GetInt32().Should().Be(20);
    }

    [Fact]
    public async Task Followers_TotalCount_EqualsProfileCount()
    {
        foreach (var name in new[] { "aaa1", "aaa2", "aaa3" })
        {
            AddEdge(AddUser(name).Id, SeedIds.DemoUser);
        }

        var test = await LoginAsync(Seed.TestLogin);

        var profile = await test.GetFromJsonAsync<JsonElement>($"/api/users/{SeedIds.DemoUser.Value}");
        var page = await test.GetFromJsonAsync<JsonElement>(Followers(SeedIds.DemoUser.Value));

        page.GetProperty("totalCount").GetInt32().Should().Be(profile.GetProperty("followersCount").GetInt32()).And.Be(3);
    }

    [Fact]
    public async Task Followers_PrivateNonFollower_LockedEmpty_ButProfileCountsRemain()
    {
        AddEdge(AddUser("fan1").Id, SeedIds.DemoUser);
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.GetAsync(Followers(SeedIds.DemoUser.Value));
        var page = await response.Content.ReadFromJsonAsync<JsonElement>();
        var profile = await test.GetFromJsonAsync<JsonElement>($"/api/users/{SeedIds.DemoUser.Value}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        page.GetProperty("locked").GetBoolean().Should().BeTrue();
        page.GetProperty("items").GetArrayLength().Should().Be(0);
        page.GetProperty("totalCount").GetInt32().Should().Be(0);
        profile.GetProperty("followersCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Followers_PrivateAcceptedFollower_Unlocked()
    {
        AddEdge(AddUser("fan1").Id, SeedIds.DemoUser);
        AddEdge(SeedIds.TestUser, SeedIds.DemoUser);
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        var page = await test.GetFromJsonAsync<JsonElement>(Followers(SeedIds.DemoUser.Value));

        page.GetProperty("locked").GetBoolean().Should().BeFalse();
        Usernames(page).Should().HaveCount(2);
    }

    [Fact]
    public async Task Followers_Owner_PrivateAccount_Unlocked()
    {
        AddEdge(AddUser("fan1").Id, SeedIds.DemoUser);
        MakePrivate(SeedIds.DemoUser);
        var demo = await LoginAsync(Seed.DemoLogin);

        var page = await demo.GetFromJsonAsync<JsonElement>(Followers(SeedIds.DemoUser.Value));

        page.GetProperty("locked").GetBoolean().Should().BeFalse();
        page.GetProperty("totalCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Followers_TargetBlockedViewer_404()
    {
        AddBlock(SeedIds.DemoUser, SeedIds.TestUser);
        var test = await LoginAsync(Seed.TestLogin);

        (await test.GetAsync(Followers(SeedIds.DemoUser.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await test.GetAsync(Following(SeedIds.DemoUser.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Followers_ViewerBlockedTarget_UnknownAndDeletedUser_404()
    {
        AddBlock(SeedIds.TestUser, SeedIds.DemoUser);
        MockDataStore.Users[SeedIds.AdminUser].Delete(isAccountDeletion: true);
        var test = await LoginAsync(Seed.TestLogin);

        (await test.GetAsync(Followers(SeedIds.DemoUser.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await test.GetAsync(Followers(SeedIds.AdminUser.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await test.GetAsync(Followers(Guid.NewGuid()))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Followers_Anonymous_PublicProfile_OK_PrivateLocked()
    {
        AddEdge(AddUser("fan1").Id, SeedIds.DemoUser);
        var anon = Client;

        (await anon.GetFromJsonAsync<JsonElement>(Followers(SeedIds.DemoUser.Value))).GetProperty("totalCount").GetInt32().Should().Be(1);

        MakePrivate(SeedIds.DemoUser);
        (await anon.GetFromJsonAsync<JsonElement>(Followers(SeedIds.DemoUser.Value))).GetProperty("locked").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task Following_QueryFilter_UsernameOrDisplayName_DiacriticsInsensitive()
    {
        var an = AddUser("nguyen_van_an", "Nguyễn Văn Ân");
        var bo = AddUser("bob", "Bồ Đào");
        AddEdge(SeedIds.DemoUser, an.Id);
        AddEdge(SeedIds.DemoUser, bo.Id);
        var test = await LoginAsync(Seed.TestLogin);

        Usernames(await test.GetFromJsonAsync<JsonElement>(Following(SeedIds.DemoUser.Value, "?query=van%20an"))).Should().BeEquivalentTo("nguyen_van_an");
        Usernames(await test.GetFromJsonAsync<JsonElement>(Following(SeedIds.DemoUser.Value, "?query=DAO"))).Should().BeEquivalentTo("bob");
        Usernames(await test.GetFromJsonAsync<JsonElement>(Following(SeedIds.DemoUser.Value, "?query=bob"))).Should().BeEquivalentTo("bob");
    }

    [Fact]
    public async Task Following_OnlyAcceptedEdges_NewestFirst_Paged()
    {
        var first = AddUser("first");
        var second = AddUser("second");
        var third = AddUser("third");
        var pending = AddUser("pending");
        foreach (var user in new[] { first, second, third })
        {
            AddEdge(SeedIds.DemoUser, user.Id);
            await Task.Delay(15);
        }

        AddEdge(SeedIds.DemoUser, pending.Id, accepted: false);
        var test = await LoginAsync(Seed.TestLogin);

        var page1 = await test.GetFromJsonAsync<JsonElement>(Following(SeedIds.DemoUser.Value, "?pageSize=2"));
        var page2 = await test.GetFromJsonAsync<JsonElement>(Following(SeedIds.DemoUser.Value, "?pageSize=2&page=2"));
        var beyond = await test.GetFromJsonAsync<JsonElement>(Following(SeedIds.DemoUser.Value, "?pageSize=2&page=9"));

        Usernames(page1).Should().Equal("third", "second");
        page1.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        page1.GetProperty("totalCount").GetInt32().Should().Be(3);
        Usernames(page2).Should().Equal("first");
        Usernames(beyond).Should().BeEmpty();
        beyond.GetProperty("totalCount").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task FollowLists_InvalidPaging_400()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.GetAsync(Followers(SeedIds.DemoUser.Value, "?pageSize=51"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await test.GetAsync(Following(SeedIds.DemoUser.Value, "?page=0"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await test.GetAsync(Following(SeedIds.DemoUser.Value, $"?query={new string('x', 51)}"))).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Followers_ItemsCarryViewerRelation()
    {
        AddEdge(SeedIds.TestUser, SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        var page = await test.GetFromJsonAsync<JsonElement>(Followers(SeedIds.DemoUser.Value));

        var item = page.GetProperty("items")[0];
        item.GetProperty("id").GetGuid().Should().Be(SeedIds.TestUser.Value);
        item.GetProperty("isBlocked").GetBoolean().Should().BeFalse();
    }

    #endregion

    #region Relation sets

    [Fact]
    public async Task RelationSets_RequireAuth()
    {
        var anon = Client;

        (await anon.GetAsync("/api/users/me/relation-sets")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        (await anon.GetAsync("/api/users/me/blocks")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task RelationSets_IncludesDormantCloseFriend_AndBlockedMutedPrivacyRequestCount()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var close = AddUser("close");
        var muted = AddUser("muted");
        var blocked = AddUser("blocked");
        var requester = AddUser("requester");

        var closeEdge = AddEdge(SeedIds.TestUser, close.Id);
        closeEdge.ToggleCloseFriend(true);
        closeEdge.Delete();                       // unfollowed -> flag dormant but still listed
        var muteEdge = AddEdge(SeedIds.TestUser, muted.Id);
        muteEdge.SetMuted(true);
        AddBlock(SeedIds.TestUser, blocked.Id);
        AddEdge(requester.Id, SeedIds.TestUser, accepted: false);
        MakePrivate(SeedIds.TestUser);

        var sets = await test.GetFromJsonAsync<JsonElement>("/api/users/me/relation-sets");

        Ids(sets, "closeFriends").Should().BeEquivalentTo([close.Id.Value]);
        Ids(sets, "muted").Should().BeEquivalentTo([muted.Id.Value]);
        Ids(sets, "blocked").Should().BeEquivalentTo([blocked.Id.Value]);
        sets.GetProperty("isPrivate").GetBoolean().Should().BeTrue();
        sets.GetProperty("requestCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task RelationSets_NoBlockedBy()
    {
        AddBlock(SeedIds.DemoUser, SeedIds.TestUser);
        var test = await LoginAsync(Seed.TestLogin);

        var sets = await test.GetFromJsonAsync<JsonElement>("/api/users/me/relation-sets");

        sets.TryGetProperty("blockedBy", out _).Should().BeFalse();
        Ids(sets, "blocked").Should().BeEmpty();
        sets.GetProperty("isPrivate").GetBoolean().Should().BeFalse();
        sets.GetProperty("requestCount").GetInt32().Should().Be(0);
    }

    private static IReadOnlyList<Guid> Ids(JsonElement sets, string name)
        => sets.GetProperty(name).EnumerateArray().Select(e => e.GetGuid()).ToList();

    #endregion

    #region Blocks

    [Fact]
    public async Task MyBlocks_ListsBlockedUsers_IsBlockedTrue()
    {
        var one = AddUser("one");
        var two = AddUser("two");
        var gone = AddUser("gone");
        var test = await LoginAsync(Seed.TestLogin);
        AddBlock(SeedIds.TestUser, one.Id);
        await Task.Delay(15);
        AddBlock(SeedIds.TestUser, two.Id);
        AddBlock(SeedIds.TestUser, gone.Id);
        gone.Delete(isAccountDeletion: true);
        AddBlock(one.Id, SeedIds.TestUser);   // reverse block must not leak into my list

        var page = await test.GetFromJsonAsync<JsonElement>("/api/users/me/blocks");

        Usernames(page).Should().Equal("two", "one");
        page.GetProperty("totalCount").GetInt32().Should().Be(2);
        page.GetProperty("items").EnumerateArray().Should().OnlyContain(i => i.GetProperty("isBlocked").GetBoolean());
    }

    [Fact]
    public async Task MyBlocks_Paged_InvalidPageSize400()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.GetAsync("/api/users/me/blocks?pageSize=51")).StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await test.GetFromJsonAsync<JsonElement>("/api/users/me/blocks")).GetProperty("pageSize").GetInt32().Should().Be(20);
    }

    #endregion
}
