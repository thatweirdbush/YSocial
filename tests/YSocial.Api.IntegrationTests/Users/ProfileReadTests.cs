using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Users;

public class ProfileReadTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly string[] ProfileFields =
    [
        "id", "username", "displayName", "bio", "avatarUrl", "coverUrl", "followersCount", "followingCount",
        "isPrivate", "isVerified", "followStatus", "isFollowing", "viewerMarkedCloseFriend", "isMuted", "isBlocked", "isBlockedBy"
    ];

    private static string ById(Guid id) => $"/api/users/{id}";

    private static string Follow(Guid id) => $"/api/users/{id}/relations/follow";

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static void MakePrivate(Domain.Users.UserId id)
        => MockDataStore.Users[id].UpdatePrivacySettings(new PrivacySettings(true, true, true));

    [Fact]
    public async Task GetProfile_ById_CountsAfterFollow()
    {
        var test = await LoginAsync(Seed.TestLogin);
        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();

        var demo = await JsonAsync(await Client.GetAsync(ById(SeedIds.DemoUser.Value)));
        var me = await JsonAsync(await Client.GetAsync(ById(SeedIds.TestUser.Value)));

        demo.GetProperty("followersCount").GetInt32().Should().Be(1);
        demo.GetProperty("followingCount").GetInt32().Should().Be(0);
        me.GetProperty("followingCount").GetInt32().Should().Be(1);
        demo.GetProperty("username").GetString().Should().Be("demo_user");
    }

    [Fact]
    public async Task GetProfile_Counts_ExcludeDeletedFollowers()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        await test.PostAsync(Follow(SeedIds.DemoUser.Value), null);
        await admin.PostAsync(Follow(SeedIds.DemoUser.Value), null);
        MockDataStore.Users[SeedIds.AdminUser].Delete(isAccountDeletion: true);

        var demo = await JsonAsync(await Client.GetAsync(ById(SeedIds.DemoUser.Value)));

        demo.GetProperty("followersCount").GetInt32().Should().Be(1, "a deleted follower is not discoverable");
    }

    [Fact]
    public async Task GetProfile_Counts_ExcludeBlockedParties_ForThatViewer()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        await test.PostAsync(Follow(SeedIds.DemoUser.Value), null);
        await admin.PostAsync(Follow(SeedIds.DemoUser.Value), null);
        (await test.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        var asTest = await JsonAsync(await test.GetAsync(ById(SeedIds.DemoUser.Value)));
        var anonymous = await JsonAsync(await Client.GetAsync(ById(SeedIds.DemoUser.Value)));

        asTest.GetProperty("followersCount").GetInt32().Should().Be(1);
        anonymous.GetProperty("followersCount").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task GetProfile_ByUsername_CaseInsensitive()
    {
        var response = await Client.GetAsync("/api/users/by-username/DEMO_User");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await JsonAsync(response)).GetProperty("id").GetGuid().Should().Be(SeedIds.DemoUser.Value);
    }

    [Fact]
    public async Task GetProfile_Unknown_404()
    {
        (await Client.GetAsync(ById(Guid.NewGuid()))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Client.GetAsync("/api/users/by-username/nobody_here")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetProfile_Deleted_404()
    {
        MockDataStore.Users[SeedIds.TestUserAlt].Delete(isAccountDeletion: true);

        (await Client.GetAsync(ById(SeedIds.TestUserAlt.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Client.GetAsync("/api/users/by-username/test_user_alt")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetProfile_ViewerBlockedTarget_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null);

        var response = await test.GetAsync(ById(SeedIds.DemoUser.Value));

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await response.Content.ReadAsStringAsync()).Should().NotContain("demo");
        (await test.GetAsync("/api/users/by-username/demo_user")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetProfile_TargetBlockedViewer_404()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var test = await LoginAsync(Seed.TestLogin);
        await demo.PostAsync($"/api/users/{SeedIds.TestUser.Value}/blocks", null);

        (await test.GetAsync(ById(SeedIds.DemoUser.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task GetProfile_Private_NonFollower_200_ExactFieldSet()
    {
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.GetAsync(ById(SeedIds.DemoUser.Value));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        body.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(ProfileFields);
        body.GetProperty("isPrivate").GetBoolean().Should().BeTrue();
        body.GetProperty("followStatus").GetString().Should().Be("none");
        body.GetProperty("isFollowing").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task GetProfile_Public_NonOwner_NoEmail()
    {
        var response = await Client.GetAsync(ById(SeedIds.DemoUser.Value));

        var raw = await response.Content.ReadAsStringAsync();
        raw.Should().NotContain("email").And.NotContain("demo@example.com").And.NotContain("profiles");
        (await JsonAsync(response)).EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(ProfileFields);
    }

    [Fact]
    public async Task GetProfile_Owner_ById_NoEmail()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.GetAsync(ById(SeedIds.TestUser.Value));

        (await response.Content.ReadAsStringAsync()).Should().NotContain("test@example.com").And.NotContain("\"email\"");
        (await JsonAsync(response)).EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(ProfileFields);
    }

    [Fact]
    public async Task GetProfile_FollowStatus_None_Pending_Accepted()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await JsonAsync(await test.GetAsync(ById(SeedIds.DemoUser.Value)))).GetProperty("followStatus").GetString().Should().Be("none");

        MakePrivate(SeedIds.DemoUser);
        await test.PostAsync(Follow(SeedIds.DemoUser.Value), null);
        var pending = await JsonAsync(await test.GetAsync(ById(SeedIds.DemoUser.Value)));
        pending.GetProperty("followStatus").GetString().Should().Be("pending");
        pending.GetProperty("isFollowing").GetBoolean().Should().BeFalse();

        MockDataStore.UserRelations.Values.Single().AcceptFollow();
        var accepted = await JsonAsync(await test.GetAsync(ById(SeedIds.DemoUser.Value)));
        accepted.GetProperty("followStatus").GetString().Should().Be("accepted");
        accepted.GetProperty("isFollowing").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task GetProfile_ViewerMarkedCloseFriend_ReflectsFlag()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync(Follow(SeedIds.DemoUser.Value), null);
        (await test.PatchAsJsonAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/close-friend", new { isCloseFriend = true })).EnsureSuccessStatusCode();

        var body = await JsonAsync(await test.GetAsync(ById(SeedIds.DemoUser.Value)));

        body.GetProperty("viewerMarkedCloseFriend").GetBoolean().Should().BeTrue();
        (await JsonAsync(await Client.GetAsync(ById(SeedIds.DemoUser.Value)))).GetProperty("viewerMarkedCloseFriend").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task GetProfile_IsBlockedByAlwaysFalse()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);

        foreach (var client in new[] { Client, test, demo })
        {
            var body = await JsonAsync(await client.GetAsync(ById(SeedIds.DemoUser.Value)));
            body.GetProperty("isBlockedBy").GetBoolean().Should().BeFalse();
            body.GetProperty("isBlocked").GetBoolean().Should().BeFalse();
        }
    }

    [Fact]
    public async Task GetMe_Anonymous_401()
    {
        (await Client.GetAsync("/api/users/me")).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task GetMe_HasEmailAndProfiles()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.GetAsync("/api/users/me");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        body.GetProperty("email").GetString().Should().Be("test@example.com");
        body.GetProperty("profile").GetProperty("id").GetGuid().Should().Be(SeedIds.TestUser.Value);
        body.GetProperty("profile").EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(ProfileFields);
        var profiles = body.GetProperty("profiles").EnumerateArray().ToList();
        profiles.Select(p => p.GetProperty("id").GetGuid()).Should().BeEquivalentTo([SeedIds.TestUser.Value, SeedIds.TestUserAlt.Value]);
        profiles.Single(p => p.GetProperty("id").GetGuid() == SeedIds.TestUser.Value).GetProperty("isDefault").GetBoolean().Should().BeTrue();
        profiles[0].EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(["id", "username", "displayName", "avatarUrl", "isDefault"]);
    }

    [Fact]
    public async Task GetMe_AfterSwitchProfile_ReturnsActiveProfile()
    {
        var tokens = await AuthHelper.RequestTokensAsync(Client, Seed.TestLogin, Seed.Password);
        Client.DefaultRequestHeaders.Authorization = new("Bearer", tokens.AccessToken);
        var switched = await JsonAsync(await Client.PutAsJsonAsync("/api/users/profiles/switch",
            new { profileId = SeedIds.TestUserAlt.Value, refreshToken = tokens.RefreshToken }));
        Client.DefaultRequestHeaders.Authorization = new("Bearer", switched.GetProperty("accessToken").GetString());

        var body = await JsonAsync(await Client.GetAsync("/api/users/me"));

        body.GetProperty("profile").GetProperty("id").GetGuid().Should().Be(SeedIds.TestUserAlt.Value);
    }

    [Fact]
    public async Task UpdateProfile_ReturnsProjection_NoEmail()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsJsonAsync("/api/users/profiles/me",
            new { displayName = "New Name", bio = "Hello", avatarUrl = "https://img.test/a.png", coverUrl = (string?)null, gender = 0, dateOfBirth = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var raw = await response.Content.ReadAsStringAsync();
        raw.Should().NotContain("test@example.com");
        using var doc = JsonDocument.Parse(raw);
        doc.RootElement.GetProperty("displayName").GetString().Should().Be("New Name");
        doc.RootElement.GetProperty("bio").GetString().Should().Be("Hello");
        doc.RootElement.GetProperty("avatarUrl").GetString().Should().Be("https://img.test/a.png");
        doc.RootElement.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(ProfileFields);
    }

    [Fact]
    public async Task UpdateProfile_OmittedGenderAndBirthDate_KeepStoredValues()
    {
        var birth = new DateTime(1990, 5, 17, 0, 0, 0, DateTimeKind.Utc);
        var stored = MockDataStore.Users[SeedIds.TestUser];
        stored.UpdateProfile(new UserProfileInfo(stored.ProfileInfo.DisplayName, null, null, null, Gender.Female, birth, stored.ProfileInfo.ProfileType));
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsJsonAsync("/api/users/profiles/me",
            new { displayName = "Only Name", bio = "Hi", avatarUrl = (string?)null, coverUrl = (string?)null });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var info = MockDataStore.Users[SeedIds.TestUser].ProfileInfo;
        info.DisplayName.Should().Be("Only Name");
        info.Gender.Should().Be(Gender.Female);
        info.DateOfBirth.Should().Be(birth);
    }

    [Fact]
    public async Task UpdateProfile_ExplicitGender_Replaces()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsJsonAsync("/api/users/profiles/me",
            new { displayName = "N", bio = (string?)null, avatarUrl = (string?)null, coverUrl = (string?)null, gender = 1 })).StatusCode.Should().Be(HttpStatusCode.OK);

        MockDataStore.Users[SeedIds.TestUser].ProfileInfo.Gender.Should().Be(Gender.Male);
    }
}
