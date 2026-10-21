using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Media;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Media;

/// <summary>
/// D34: the exact avatar payload matrix (spec 2.4) and its precedence rules.
/// </summary>
public class AvatarTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly UserId Me = SeedIds.TestUser;

    #region Helpers
    private Task<MediaAsset> NewAvatarAsync(string status = "Pending", UserId? owner = null, MediaPurpose? purpose = null)
        => MediaArrange.AssetAsync(Factory, status, owner, purpose: purpose ?? MediaPurpose.Avatar);

    private string? StoredAvatar => Store.Users[Me].ProfileInfo.AvatarUrl;

    private async Task<HttpResponseMessage> PutAsync(object body)
    {
        var client = await LoginAsync(Seed.TestLogin);
        return await client.PutAsJsonAsync("/api/users/profiles/me", body);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static async Task AssertValidationAsync(HttpResponseMessage response, string field)
    {
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await JsonAsync(response);
        body.GetProperty("code").GetString().Should().Be("ValidationFailed");
        body.GetProperty("errors").TryGetProperty(field, out _).Should().BeTrue($"errors must name '{field}'");
    }

    /// <summary>
    /// Gives the profile an avatar that is one of our assets (uploaded, then saved through the endpoint).
    /// </summary>
    private async Task<MediaAsset> HaveAvatarAsync()
    {
        var asset = await NewAvatarAsync();
        (await PutAsync(new { displayName = "Me", avatarMediaId = asset.Id.Value })).StatusCode.Should().Be(HttpStatusCode.OK);
        return asset;
    }

    private MediaAssetStatus StatusOf(MediaAsset asset) => Store.MediaAssets[asset.Id].Status;
    #endregion

    #region New upload
    [Fact]
    public async Task NewUpload_SetsTheAvatar_ToTheAssetUrl_AndAttachesIt()
    {
        var asset = await NewAvatarAsync();

        var response = await PutAsync(new { displayName = "Me", bio = "b", avatarMediaId = asset.Id.Value });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await JsonAsync(response)).GetProperty("avatarUrl").GetString().Should().Be(Store.MediaAssets[asset.Id].Url);
        StoredAvatar.Should().Be(Store.MediaAssets[asset.Id].Url);
        StatusOf(asset).Should().Be(MediaAssetStatus.Attached);
    }

    [Fact]
    public async Task NewUpload_ReplacingAnOwnAvatar_ReleasesTheOldAsset_InTheSameSave()
    {
        var old = await HaveAvatarAsync();
        var next = await NewAvatarAsync();

        (await PutAsync(new { displayName = "Me", avatarMediaId = next.Id.Value })).StatusCode.Should().Be(HttpStatusCode.OK);

        StatusOf(old).Should().Be(MediaAssetStatus.Released);
        StatusOf(next).Should().Be(MediaAssetStatus.Attached);
        StoredAvatar.Should().Be(Store.MediaAssets[next.Id].Url);
        Factory.Storage.StoredIds.Should().Contain(old.PublicId, "released files are deleted by the sweep after the grace period, not now");
    }

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Attached")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public async Task NewUpload_AssetNotPending_Is404_AndTheProfileIsUnchanged(string status)
    {
        var current = await HaveAvatarAsync();
        var before = StoredAvatar;
        var asset = await NewAvatarAsync(status);

        var response = await PutAsync(new { displayName = "Renamed", avatarMediaId = asset.Id.Value });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        StoredAvatar.Should().Be(before);
        Store.Users[Me].ProfileInfo.DisplayName.Should().NotBe("Renamed", "a failed request saves nothing");
        StatusOf(current).Should().Be(MediaAssetStatus.Attached, "a failed request never loses the old avatar");
    }

    [Fact]
    public async Task NewUpload_ForeignUnknownAndPostPurposeAssets_Are404()
    {
        var foreign = await NewAvatarAsync(owner: SeedIds.DemoUser);
        var postAsset = await NewAvatarAsync(purpose: MediaPurpose.Post);

        (await PutAsync(new { displayName = "Me", avatarMediaId = foreign.Id.Value })).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await PutAsync(new { displayName = "Me", avatarMediaId = Guid.NewGuid() })).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await PutAsync(new { displayName = "Me", avatarMediaId = postAsset.Id.Value })).StatusCode.Should().Be(HttpStatusCode.NotFound);

        StatusOf(foreign).Should().Be(MediaAssetStatus.Pending);
        StatusOf(postAsset).Should().Be(MediaAssetStatus.Pending);
    }

    [Fact]
    public async Task NewUpload_ForeignAssetAnswersLikeUnknown_NoIdProbing()
    {
        var foreign = await NewAvatarAsync(owner: SeedIds.DemoUser);

        var foreignBody = await JsonAsync(await PutAsync(new { displayName = "Me", avatarMediaId = foreign.Id.Value }));
        var unknownBody = await JsonAsync(await PutAsync(new { displayName = "Me", avatarMediaId = Guid.NewGuid() }));

        foreignBody.GetProperty("detail").GetString().Should().Be(unknownBody.GetProperty("detail").GetString());
        foreignBody.GetProperty("code").GetString().Should().Be(unknownBody.GetProperty("code").GetString());
    }
    #endregion

    #region Precedence: both fields
    [Theory]
    [InlineData("null")]
    [InlineData("same")]
    [InlineData("other")]
    public async Task BothFields_AnyAvatarUrlValue_Is400_Ambiguous_AndNothingChanges(string avatarUrl)
    {
        var current = await HaveAvatarAsync();
        var asset = await NewAvatarAsync();
        var value = avatarUrl switch { "null" => null, "same" => StoredAvatar, _ => "https://img.example.com/a.png" };

        var response = await PutAsync(new { displayName = "Me", avatarUrl = value, avatarMediaId = asset.Id.Value });

        await AssertValidationAsync(response, "avatarUrl");
        StatusOf(asset).Should().Be(MediaAssetStatus.Pending);
        StatusOf(current).Should().Be(MediaAssetStatus.Attached);
    }
    #endregion

    #region Keep, clear, replace
    [Fact]
    public async Task Keep_SendingTheStoredUrl_LeavesAvatarAndAssetUntouched()
    {
        var current = await HaveAvatarAsync();

        var response = await PutAsync(new { displayName = "Me", avatarUrl = StoredAvatar });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        StatusOf(current).Should().Be(MediaAssetStatus.Attached);
        StoredAvatar.Should().Be(Store.MediaAssets[current.Id].Url);
    }

    [Fact]
    public async Task UnrelatedEdit_WithTheCurrentAvatarUrl_KeepsTheAvatar()
    {
        var current = await HaveAvatarAsync();

        (await PutAsync(new { displayName = "New Name", bio = "new bio", avatarUrl = StoredAvatar })).StatusCode.Should().Be(HttpStatusCode.OK);

        Store.Users[Me].ProfileInfo.DisplayName.Should().Be("New Name");
        StatusOf(current).Should().Be(MediaAssetStatus.Attached);
    }

    [Fact]
    public async Task Remove_AvatarUrlNull_ClearsAndReleasesTheAsset()
    {
        var current = await HaveAvatarAsync();

        (await PutAsync(new { displayName = "Me", avatarUrl = (string?)null })).StatusCode.Should().Be(HttpStatusCode.OK);

        StoredAvatar.Should().BeNull();
        StatusOf(current).Should().Be(MediaAssetStatus.Released);
    }

    [Fact]
    public async Task OmittingAvatarUrl_MeansClear_ReplaceSemantics()
    {
        var current = await HaveAvatarAsync();

        (await PutAsync(new { displayName = "Me" })).StatusCode.Should().Be(HttpStatusCode.OK);

        StoredAvatar.Should().BeNull();
        StatusOf(current).Should().Be(MediaAssetStatus.Released);
    }

    [Fact]
    public async Task ReplaceWithExternalHttpsUrl_Works_AndReleasesTheOldAsset()
    {
        var current = await HaveAvatarAsync();

        (await PutAsync(new { displayName = "Me", avatarUrl = "https://img.example.com/me.png" })).StatusCode.Should().Be(HttpStatusCode.OK);

        StoredAvatar.Should().Be("https://img.example.com/me.png");
        StatusOf(current).Should().Be(MediaAssetStatus.Released);
    }

    [Fact]
    public async Task ExternalAvatar_ThenCleared_ReleasesNothing()
    {
        (await PutAsync(new { displayName = "Me", avatarUrl = "https://img.example.com/me.png" })).StatusCode.Should().Be(HttpStatusCode.OK);

        (await PutAsync(new { displayName = "Me", avatarUrl = (string?)null })).StatusCode.Should().Be(HttpStatusCode.OK);

        Store.MediaAssets.Values.Should().BeEmpty();
    }

    [Fact]
    public async Task ClearingTheAvatar_OnlyReleasesTheAssetWhoseUrlMatches_NotOtherAttachedAvatars()
    {
        var current = await HaveAvatarAsync();
        var bystander = await NewAvatarAsync("Attached");

        (await PutAsync(new { displayName = "Me", avatarUrl = (string?)null })).StatusCode.Should().Be(HttpStatusCode.OK);

        StatusOf(current).Should().Be(MediaAssetStatus.Released);
        StatusOf(bystander).Should().Be(MediaAssetStatus.Attached);
    }
    #endregion

    #region Spoofing
    [Fact]
    public async Task AvatarUrl_PointingAtAnotherUsersAsset_Is400()
    {
        var foreign = await NewAvatarAsync("Attached", SeedIds.DemoUser);

        await AssertValidationAsync(await PutAsync(new { displayName = "Me", avatarUrl = Store.MediaAssets[foreign.Id].Url }), "avatarUrl");
        StoredAvatar.Should().NotBe(Store.MediaAssets[foreign.Id].Url);
    }

    [Fact]
    public async Task AvatarUrl_OurStorageButNotTheStoredOne_Is400_EvenForAnOwnPendingAsset()
    {
        var pending = await NewAvatarAsync();

        await AssertValidationAsync(await PutAsync(new { displayName = "Me", avatarUrl = Store.MediaAssets[pending.Id].Url }), "avatarUrl");
        StatusOf(pending).Should().Be(MediaAssetStatus.Pending);
    }

    [Theory]
    [InlineData("javascript:alert(1)")]
    [InlineData("data:image/png;base64,AAAA")]
    [InlineData("ftp://example.com/a.png")]
    [InlineData("/relative/a.png")]
    [InlineData("not a url")]
    public async Task AvatarUrl_NotAnAbsoluteHttpUrl_Is400(string url)
        => await AssertValidationAsync(await PutAsync(new { displayName = "Me", avatarUrl = url }), "avatarUrl");
    #endregion
}
