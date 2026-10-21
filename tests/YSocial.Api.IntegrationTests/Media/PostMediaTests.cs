using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Media;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Media;

public class PostMediaTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    #region Helpers
    private async Task<MediaAsset> PendingAsync(MediaKind? kind = null) => await MediaArrange.AssetAsync(Factory, kind: kind);

    private async Task<HttpResponseMessage> CreateAsync(object body, string login = Seed.TestLogin)
    {
        var client = await LoginAsync(login);
        return await client.PostAsJsonAsync("/api/posts", body);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static async Task AssertFieldErrorAsync(HttpResponseMessage response, string field)
    {
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await JsonAsync(response);
        body.GetProperty("code").GetString().Should().Be("ValidationFailed");
        body.GetProperty("errors").TryGetProperty(field, out _).Should().BeTrue($"errors must name '{field}'");
    }

    private static async Task AssertNotFoundAsync(HttpResponseMessage response)
    {
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("NotFound");
    }
    #endregion

    #region Create
    [Fact]
    public async Task Create_WithMedia_ReturnsOrderedMedia_AttachesAssets_AndSetsLegacyImageUrl()
    {
        var first = await PendingAsync();
        var video = await PendingAsync(MediaKind.Video);
        var third = await PendingAsync();

        var response = await CreateAsync(new { content = "with media", mediaIds = new[] { video.Id.Value, first.Id.Value, third.Id.Value } });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var post = await JsonAsync(response);
        var media = post.GetProperty("media").EnumerateArray().ToList();
        media.Select(m => m.GetProperty("id").GetGuid()).Should().Equal(video.Id.Value, first.Id.Value, third.Id.Value);
        media.Select(m => m.GetProperty("kind").GetString()).Should().Equal("video", "image", "image");
        media[0].GetProperty("posterUrl").GetString().Should().NotBeNull();
        media[0].GetProperty("durationSeconds").GetDouble().Should().Be(5);
        post.GetProperty("imageUrl").GetString().Should().Be(Store.MediaAssets[first.Id].Url, "imageUrl = first uploaded IMAGE");

        Store.MediaAssets.Values.Should().OnlyContain(a => a.Status == MediaAssetStatus.Attached);
        var stored = Store.Posts[new(post.GetProperty("id").GetGuid())];
        stored.Media.Select(m => m.Position).Should().Equal(0, 1, 2);
    }

    [Fact]
    public async Task Create_MediaOnly_EmptyContent_Is201()
    {
        var asset = await PendingAsync();

        var response = await CreateAsync(new { content = "", mediaIds = new[] { asset.Id.Value } });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        (await JsonAsync(response)).GetProperty("content").GetString().Should().BeEmpty();
    }

    [Fact]
    public async Task Create_ExternalImageOnly_EmptyContent_Is201()
    {
        var response = await CreateAsync(new { content = "", imageUrl = "https://media.giphy.com/media/x/giphy.gif" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Create_NoMediaAndEmptyContent_StillFailsOnContent()
        => await AssertFieldErrorAsync(await CreateAsync(new { content = "", mediaIds = Array.Empty<Guid>() }), "content");

    [Fact]
    public async Task Create_WithoutMedia_HasAnEmptyMediaArray()
    {
        var post = await JsonAsync(await CreateAsync(new { content = "plain" }));

        post.GetProperty("media").ValueKind.Should().Be(JsonValueKind.Array);
        post.GetProperty("media").GetArrayLength().Should().Be(0);
        post.TryGetProperty("imageUrl", out _).Should().BeFalse();
    }

    [Fact]
    public async Task Create_TenMedia_Passes_ElevenFails()
    {
        var ids = new List<Guid>();
        for (var i = 0; i < 11; i++) ids.Add((await PendingAsync()).Id.Value);

        await AssertFieldErrorAsync(await CreateAsync(new { content = "x", mediaIds = ids }), "mediaIds");
        (await CreateAsync(new { content = "x", mediaIds = ids.Take(10) })).StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Create_DuplicateMediaIds_Is400()
    {
        var asset = await PendingAsync();

        await AssertFieldErrorAsync(await CreateAsync(new { content = "x", mediaIds = new[] { asset.Id.Value, asset.Id.Value } }), "mediaIds");
        Store.MediaAssets[asset.Id].Status.Should().Be(MediaAssetStatus.Pending);
    }

    [Fact]
    public async Task Create_ImageUrlTogetherWithMediaIds_Is400()
    {
        var asset = await PendingAsync();

        await AssertFieldErrorAsync(
            await CreateAsync(new { content = "x", imageUrl = "https://media.giphy.com/x.gif", mediaIds = new[] { asset.Id.Value } }), "imageUrl");
    }

    [Theory]
    [InlineData("https://res.cloudinary.com/demo/image/upload/v1/ysocial/other/posts/someone-elses.jpg")]
    [InlineData("https://res.cloudinary.com/demo/video/upload/x.mp4")]
    public async Task Create_ImageUrlPointingAtOurStorage_Is400(string url)
        => await AssertFieldErrorAsync(await CreateAsync(new { content = "x", imageUrl = url }), "imageUrl");

    [Fact]
    public async Task Create_ImageUrlOfAnotherCloud_IsStillAnExternalUrl()
        => (await CreateAsync(new { content = "x", imageUrl = "https://res.cloudinary.com/other-cloud/image/upload/a.jpg" })).StatusCode.Should().Be(HttpStatusCode.Created);

    [Theory]
    [InlineData("Uploading")]
    [InlineData("Attached")]
    [InlineData("Released")]
    [InlineData("Deleting")]
    public async Task Create_AssetNotPending_Is404_ForTheWholeRequest_NothingAttached(string status)
    {
        var good = await PendingAsync();
        var bad = await MediaArrange.AssetAsync(Factory, status);

        await AssertNotFoundAsync(await CreateAsync(new { content = "x", mediaIds = new[] { good.Id.Value, bad.Id.Value } }));

        Store.MediaAssets[good.Id].Status.Should().Be(MediaAssetStatus.Pending, "no partial attach");
        Store.Posts.Values.Should().NotContain(p => p.Content == "x");
    }

    [Fact]
    public async Task Create_ForeignAsset_UnknownAsset_AvatarPurposeAsset_AreAll404()
    {
        var foreign = await MediaArrange.AssetAsync(Factory, owner: SeedIds.DemoUser);
        var avatar = await MediaArrange.AssetAsync(Factory, purpose: MediaPurpose.Avatar);

        await AssertNotFoundAsync(await CreateAsync(new { content = "x", mediaIds = new[] { foreign.Id.Value } }));
        await AssertNotFoundAsync(await CreateAsync(new { content = "x", mediaIds = new[] { Guid.NewGuid() } }));
        await AssertNotFoundAsync(await CreateAsync(new { content = "x", mediaIds = new[] { avatar.Id.Value } }));

        Store.MediaAssets[foreign.Id].Status.Should().Be(MediaAssetStatus.Pending);
    }

    [Fact]
    public async Task Create_SameAssetTwice_SecondIs404()
    {
        var asset = await PendingAsync();

        (await CreateAsync(new { content = "one", mediaIds = new[] { asset.Id.Value } })).StatusCode.Should().Be(HttpStatusCode.Created);
        await AssertNotFoundAsync(await CreateAsync(new { content = "two", mediaIds = new[] { asset.Id.Value } }));
    }

    [Fact]
    public async Task Create_SameAssetInParallel_ExactlyOneWins()
    {
        var asset = await PendingAsync();
        var one = await LoginAsync(Seed.TestLogin);
        var two = await LoginAsync(Seed.TestLogin);
        var body = new { content = "race", mediaIds = new[] { asset.Id.Value } };

        var responses = await Task.WhenAll(one.PostAsJsonAsync("/api/posts", body), two.PostAsJsonAsync("/api/posts", body));

        responses.Count(r => r.StatusCode == HttpStatusCode.Created).Should().Be(1);
        responses.Single(r => r.StatusCode != HttpStatusCode.Created).StatusCode.Should().BeOneOf(HttpStatusCode.Conflict, HttpStatusCode.NotFound);
        Store.Posts.Values.Count(p => p.Content == "race").Should().Be(1);
        Store.MediaAssets[asset.Id].Status.Should().Be(MediaAssetStatus.Attached);
    }
    #endregion

    #region Read & edit
    private async Task<(Guid PostId, MediaAsset Asset)> PostWithMediaAsync(string content = "has media")
    {
        var asset = await PendingAsync();
        var post = await JsonAsync(await CreateAsync(new { content, mediaIds = new[] { asset.Id.Value } }));
        return (post.GetProperty("id").GetGuid(), asset);
    }

    [Fact]
    public async Task Get_Feed_AndUserPosts_CarryTheMedia_AndCommentsHaveAnEmptyArray()
    {
        var (postId, asset) = await PostWithMediaAsync();
        var client = await LoginAsync(Seed.TestLogin);

        var single = await JsonAsync(await client.GetAsync($"/api/posts/{postId}"));
        single.GetProperty("media")[0].GetProperty("id").GetGuid().Should().Be(asset.Id.Value);

        var comment = await JsonAsync(await client.PostAsJsonAsync($"/api/comments", new { postId, content = "a comment" }));
        comment.GetProperty("media").GetArrayLength().Should().Be(0);

        var feed = await JsonAsync(await client.GetAsync("/api/feed"));
        feed.ToString().Should().Contain(asset.Id.Value.ToString());
    }

    [Fact]
    public async Task Edit_PostWithMedia_ToEmptyText_Is200()
    {
        var (postId, _) = await PostWithMediaAsync();
        var client = await LoginAsync(Seed.TestLogin);

        var response = await client.PutAsJsonAsync($"/api/posts/{postId}", new { content = "" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        body.GetProperty("content").GetString().Should().BeEmpty();
        body.GetProperty("media").GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task Edit_PostWithoutMedia_ToEmptyText_Is400OnContent()
    {
        var created = await JsonAsync(await CreateAsync(new { content = "plain" }));
        var client = await LoginAsync(Seed.TestLogin);

        await AssertFieldErrorAsync(await client.PutAsJsonAsync($"/api/posts/{created.GetProperty("id").GetGuid()}", new { content = "" }), "content");
    }

    [Fact]
    public async Task Edit_NeverChangesTheMedia()
    {
        var (postId, asset) = await PostWithMediaAsync();
        var client = await LoginAsync(Seed.TestLogin);

        var body = await JsonAsync(await client.PutAsJsonAsync($"/api/posts/{postId}", new { content = "edited" }));

        body.GetProperty("media")[0].GetProperty("id").GetGuid().Should().Be(asset.Id.Value);
    }

    [Fact]
    public async Task DeleteAndRestore_KeepTheMedia_AndTheAssetStaysAttached()
    {
        var (postId, asset) = await PostWithMediaAsync();
        var client = await LoginAsync(Seed.TestLogin);

        (await client.DeleteAsync($"/api/posts/{postId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        Store.MediaAssets[asset.Id].Status.Should().Be(MediaAssetStatus.Attached);
        Factory.Storage.StoredIds.Should().Contain(asset.PublicId);

        (await client.PutAsync($"/api/posts/{postId}/restore", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        var restored = await JsonAsync(await client.GetAsync($"/api/posts/{postId}"));
        restored.GetProperty("media").GetArrayLength().Should().Be(1);
    }
    #endregion
}
