using FluentAssertions;
using System.Net;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Media;

public class DiscardMediaTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly UserId Owner = SeedIds.TestUser;

    /// <summary>
    /// A row in the given status with its remote file stored (like the real flow leaves it).
    /// </summary>
    private async Task<MediaAsset> ArrangeAsync(string status, UserId? owner = null)
    {
        var who = owner ?? Owner;
        var asset = MediaAsset.Create(who, MediaKind.Image, MediaPurpose.Post, "test");

        if (status != "Uploading") asset.MarkUploaded($"https://res.cloudinary.com/demo/image/upload/v1/{asset.PublicId}.jpg", null, 10, 10, null, 5);

        switch (status)
        {
            case "Attached": asset.MarkAttached(who, MediaPurpose.Post); break;
            case "Released": asset.MarkAttached(who, MediaPurpose.Post); asset.Release(); break;
            case "Deleting": asset.Claim(DateTime.UtcNow); break;
        }

        Store.MediaAssets.Add(asset);
        await Factory.Storage.UploadAsync(new MediaUpload(asset.Id, asset.PublicId, MediaKind.Image, MediaPurpose.Post, "image/png", new MemoryStream([1])), default);
        return asset;
    }

    private async Task<HttpResponseMessage> DeleteAsync(Guid id, string login = Seed.TestLogin)
    {
        var client = await LoginAsync(login);
        return await client.DeleteAsync($"/api/media/{id}");
    }

    private static async Task AssertNotFoundAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("code").GetString().Should().Be("NotFound");
        doc.RootElement.GetProperty("detail").GetString().Should().Be("Resource not found.");
    }

    [Fact]
    public async Task Discard_OwnPending_Is204_RowAndFileAreGone()
    {
        var asset = await ArrangeAsync("Pending");

        (await DeleteAsync(asset.Id.Value)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Store.MediaAssets.Values.Should().BeEmpty();
        Factory.Storage.StoredIds.Should().BeEmpty();
    }

    [Fact]
    public async Task Discard_Anonymous_Is401()
    {
        var asset = await ArrangeAsync("Pending");

        var response = await Client.DeleteAsync($"/api/media/{asset.Id.Value}");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        Store.MediaAssets.Values.Should().ContainSingle();
    }

    [Fact]
    public async Task Discard_UnknownId_Is404()
        => await AssertNotFoundAsync(await DeleteAsync(Guid.NewGuid()));

    [Fact]
    public async Task Discard_ForeignPending_Is404_AndUntouched()
    {
        var foreign = await ArrangeAsync("Pending", SeedIds.DemoUser);

        await AssertNotFoundAsync(await DeleteAsync(foreign.Id.Value));

        Store.MediaAssets[foreign.Id].Status.Should().Be(MediaAssetStatus.Pending);
        Factory.Storage.StoredIds.Should().Equal(foreign.PublicId);
    }

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Attached")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public async Task Discard_OwnButNotPending_Is404_SameAnswer(string status)
    {
        var asset = await ArrangeAsync(status);

        await AssertNotFoundAsync(await DeleteAsync(asset.Id.Value));

        Store.MediaAssets[asset.Id].Status.Name.Should().Be(status);
        Factory.Storage.StoredIds.Should().Equal(asset.PublicId);
    }

    [Fact]
    public async Task Discard_Twice_SecondIs404()
    {
        var asset = await ArrangeAsync("Pending");

        (await DeleteAsync(asset.Id.Value)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        await AssertNotFoundAsync(await DeleteAsync(asset.Id.Value));
    }

    [Fact]
    public async Task Discard_WhenTheProviderFails_StillAnswers204_AndTheRowStaysDeletingForTheSweep()
    {
        var asset = await ArrangeAsync("Pending");
        Factory.Storage.FailDeletes = true;

        (await DeleteAsync(asset.Id.Value)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        Store.MediaAssets[asset.Id].Status.Should().Be(MediaAssetStatus.Deleting);
        Factory.Storage.StoredIds.Should().Equal(asset.PublicId);
    }

    [Fact]
    public async Task Discard_MalformedId_Is404()
    {
        var client = await LoginAsync(Seed.TestLogin);

        (await client.DeleteAsync("/api/media/not-a-guid")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
