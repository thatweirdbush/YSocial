using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Relations;

/// <summary>
/// Regression tests for the final whole-branch review findings.
/// </summary>
public class ReviewFixTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static User AddUser(string username)
    {
        var user = User.Create(AccountId.New(), username, Country.Vietnam, isDefault: true);
        user.ClearDomainEvents();
        Store.Users.TryAdd(user.Id, user);
        return user;
    }

    private static StringContent Json(string body) => new(body, Encoding.UTF8, "application/json");

    [Theory]
    [InlineData("{}")]
    [InlineData("{\"private\":false}")]
    [InlineData("{\"isPrivate\":null}")]
    public async Task Privacy_MissingOrNullFlag_400_AndNothingChanges(string body)
    {
        Store.Users.Update(SeedIds.DemoUser, x => x.UpdatePrivacySettings(new PrivacySettings(true, true, true)));
        var requester = AddUser("requester");
        var edge = UserRelation.Create(requester.Id, SeedIds.DemoUser);
        edge.RequestFollow(isTargetPrivate: true);
        edge.ClearDomainEvents();
        Store.UserRelations.TryAdd(edge.Id, edge);
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.PutAsync("/api/users/profiles/me/privacy", Json(body));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        Store.Users[SeedIds.DemoUser].PrivacySettings.IsPrivateProfile.Should().BeTrue();
        Store.UserRelations[edge.Id].FollowStatus.Should().Be(FollowStatus.Pending);
    }

    [Fact]
    public async Task Privacy_GoPublic_AcceptedCount_ExcludesDeletedRequester()
    {
        Store.Users.Update(SeedIds.DemoUser, x => x.UpdatePrivacySettings(new PrivacySettings(true, true, true)));
        var live = AddUser("liveuser");
        var gone = AddUser("goneuser");
        foreach (var user in new[] { live, gone })
        {
            var edge = UserRelation.Create(user.Id, SeedIds.DemoUser);
            edge.RequestFollow(isTargetPrivate: true);
            edge.ClearDomainEvents();
            Store.UserRelations.TryAdd(edge.Id, edge);
        }

        Store.Users.Update(gone.Id, x => x.Delete(isAccountDeletion: true));
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.PutAsJsonAsync("/api/users/profiles/me/privacy", new { isPrivate = false });

        (await response.Content.ReadFromJsonAsync<JsonElement>()).GetProperty("acceptedCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task Paging_HugePageNumber_ReturnsEmptyPage_NotFirstPage()
    {
        var follower = AddUser("follower1");
        var edge = UserRelation.Create(follower.Id, SeedIds.DemoUser);
        edge.RequestFollow(isTargetPrivate: false);
        edge.ClearDomainEvents();
        Store.UserRelations.TryAdd(edge.Id, edge);
        var test = await LoginAsync(Seed.TestLogin);

        var page = await test.GetFromJsonAsync<JsonElement>($"/api/users/{SeedIds.DemoUser.Value}/followers?page={int.MaxValue}&pageSize=50");

        page.GetProperty("items").GetArrayLength().Should().Be(0);
        page.GetProperty("totalCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task FollowUnknownUser_And_FollowUserWhoBlockedMe_HaveIdenticalErrorBody()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var block = UserBlock.Create(SeedIds.DemoUser, SeedIds.TestUser);
        block.ClearDomainEvents();
        Store.UserBlocks.TryAdd(block.Id, block);

        var blocked = await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);
        var unknown = await test.PostAsync($"/api/users/{Guid.NewGuid()}/relations/follow", null);

        blocked.StatusCode.Should().Be(HttpStatusCode.NotFound);
        unknown.StatusCode.Should().Be(HttpStatusCode.NotFound);
        var blockedBody = await blocked.Content.ReadFromJsonAsync<JsonElement>();
        var unknownBody = await unknown.Content.ReadFromJsonAsync<JsonElement>();
        unknownBody.GetProperty("detail").GetString().Should().Be(blockedBody.GetProperty("detail").GetString());
        unknownBody.GetProperty("code").GetString().Should().Be(blockedBody.GetProperty("code").GetString());
    }

    [Fact]
    public async Task RelationSets_Blocked_ExcludesDeletedUsers_LikeBlockList()
    {
        var gone = AddUser("goneuser");
        var block = UserBlock.Create(SeedIds.TestUser, gone.Id);
        block.ClearDomainEvents();
        Store.UserBlocks.TryAdd(block.Id, block);
        Store.Users.Update(gone.Id, x => x.Delete(isAccountDeletion: true));
        var test = await LoginAsync(Seed.TestLogin);

        var sets = await test.GetFromJsonAsync<JsonElement>("/api/users/me/relation-sets");

        sets.GetProperty("blocked").GetArrayLength().Should().Be(0);
    }
}
