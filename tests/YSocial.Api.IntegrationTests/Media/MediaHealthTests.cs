using FluentAssertions;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Media;

/// <summary>
/// The app with and without media storage keys: health, 503 mapping, and everything else keeps working.
/// </summary>
[Collection(ApiCollection.Name)]
public class MediaHealthTests
{
    private static ApiFactory WithoutKeys() => new(Store.Database, StorageMode.Unavailable);

    [Fact]
    public async Task Health_WithStorage_IsHealthy_Anonymous()
    {
        using var factory = new ApiFactory(Store.Database);
        using var client = factory.CreateApiClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        (await response.Content.ReadAsStringAsync()).Should().Be("Healthy");
    }

    [Fact]
    public async Task Health_WithoutKeys_IsDegraded_Http200_NoDetails()
    {
        using var factory = WithoutKeys();
        using var client = factory.CreateApiClient();

        var response = await client.GetAsync("/health");

        response.StatusCode.Should().Be(HttpStatusCode.OK, "the app still serves everything except media");
        var body = await response.Content.ReadAsStringAsync();
        body.Should().Be("Degraded");
    }

    [Fact]
    public async Task Startup_WithoutKeys_LogsOneWarning_NamingNoSecrets()
    {
        using var factory = WithoutKeys();
        using var client = factory.CreateApiClient();
        await client.GetAsync("/health");

        var warnings = factory.Logs.Entries.Where(e => e.Category == "YSocial.Api" && e.Level == LogLevel.Warning && e.Message.Contains("Media storage is not configured")).ToList();

        warnings.Should().ContainSingle();
    }

    [Fact]
    public void Startup_WithStorage_LogsNoMediaWarning()
    {
        using var factory = new ApiFactory(Store.Database);
        using var client = factory.CreateApiClient();

        factory.Logs.Entries.Should().NotContain(e => e.Category == "YSocial.Api" && e.Message.Contains("Media storage is not configured"));
    }

    [Fact]
    public async Task WithoutKeys_Upload_And_Discard_Answer503_ButTextPostingStillWorks()
    {
        Store.Reset();
        using var factory = WithoutKeys();
        var client = await AuthHelper.LoginAsync(factory, Seed.TestLogin);

        using var form = UploadMediaTests.Form("post", ("a.png", MediaSamples.Png(10, 10, 100), "image/png"));
        var upload = await client.PostAsync("/api/media", form);
        var discard = await client.DeleteAsync($"/api/media/{Guid.NewGuid()}");
        var post = await client.PostAsJsonAsync("/api/posts", new { content = "text still works" });

        foreach (var response in new[] { upload, discard })
        {
            response.StatusCode.Should().Be(HttpStatusCode.ServiceUnavailable);
            response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
            using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
            doc.RootElement.GetProperty("code").GetString().Should().Be("MediaStorageUnavailable");
        }

        post.StatusCode.Should().Be(HttpStatusCode.Created);
        Store.MediaAssets.Values.Should().BeEmpty("a 503 upload leaves no rows behind");
    }

    [Fact]
    public async Task WithoutKeys_PostWithImageUrlOfOurStorage_IsNotRejectedByOwnership_ButStillNeedsHttpUrl()
    {
        Store.Reset();
        using var factory = WithoutKeys();
        var client = await AuthHelper.LoginAsync(factory, Seed.TestLogin);

        // No cloud name to compare with: nothing can be "ours", so a plain external url is fine
        var response = await client.PostAsJsonAsync("/api/posts", new { content = "x", imageUrl = "https://res.cloudinary.com/demo/image/upload/a.jpg" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Health_IsAnonymousAndNeedsNoToken()
    {
        using var factory = new ApiFactory(Store.Database);
        using var client = factory.CreateApiClient();
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", "garbage");

        (await client.GetAsync("/health")).StatusCode.Should().Be(HttpStatusCode.OK);
    }
}
