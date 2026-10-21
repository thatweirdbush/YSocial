using FluentAssertions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Routing;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.AspNetCore.Http.Metadata;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.Features.Media;
using YSocial.Domain.Media;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Media;

public class UploadMediaTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private const long MiB = 1024 * 1024;

    #region Helpers
    internal static MultipartFormDataContent Form(string? purpose, params (string Name, byte[] Bytes, string ContentType)[] files)
    {
        var form = new MultipartFormDataContent();
        if (purpose is not null) form.Add(new StringContent(purpose), "purpose");

        foreach (var (name, bytes, contentType) in files)
        {
            var part = new ByteArrayContent(bytes);
            part.Headers.ContentType = new MediaTypeHeaderValue(contentType);
            form.Add(part, "files", name);
        }

        return form;
    }

    private static (string, byte[], string) Png(string name = "a.png", int width = 800, int height = 600, int padding = 200)
        => (name, MediaSamples.Png(width, height, padding), "image/png");

    private static (string, byte[], string) Mp4(string name = "v.mp4") => (name, MediaSamples.Mp4(padding: 500), "video/mp4");

    private async Task<HttpResponseMessage> UploadAsync(string? purpose, params (string, byte[], string)[] files)
    {
        var client = await LoginAsync(Seed.TestLogin);
        using var form = Form(purpose, files);
        return await client.PostAsync("/api/media", form);
    }

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static async Task AssertProblemAsync(HttpResponseMessage response, HttpStatusCode status, string code)
    {
        response.StatusCode.Should().Be(status);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be(code);
    }

    private static async Task AssertFilesErrorAsync(HttpResponseMessage response)
    {
        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "ValidationFailed");
        (await JsonAsync(response)).GetProperty("errors").TryGetProperty("files", out _).Should().BeTrue("errors must name 'files'");
    }

    private void AssertNothingLeft()
    {
        Store.MediaAssets.Values.Should().BeEmpty();
        Factory.Storage.StoredIds.Should().BeEmpty();
    }
    #endregion

    #region Success
    [Fact]
    public async Task Upload_Anonymous_Is401()
    {
        using var form = Form("post", Png());

        await AssertProblemAsync(await Client.PostAsync("/api/media", form), HttpStatusCode.Unauthorized, "Unauthenticated");
    }

    [Fact]
    public async Task Upload_TwoImagesAndVideo_Returns201WithPendingAssets()
    {
        var response = await UploadAsync("post", Png("1.png"), Png("2.png"), Mp4());

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var items = (await JsonAsync(response)).EnumerateArray().ToList();
        items.Should().HaveCount(3);
        items.Select(i => i.GetProperty("kind").GetString()).Should().Equal("image", "image", "video");

        foreach (var item in items)
        {
            Guid.TryParse(item.GetProperty("id").GetString(), out _).Should().BeTrue();
            Factory.Storage.OwnsUrl(item.GetProperty("url").GetString()).Should().BeTrue();
            item.GetProperty("width").GetInt32().Should().BePositive();
            item.GetProperty("bytes").GetInt64().Should().BePositive();
        }

        items[0].GetProperty("posterUrl").ValueKind.Should().Be(JsonValueKind.Null);
        items[2].GetProperty("posterUrl").GetString().Should().Contain("so_0");
        items[2].GetProperty("durationSeconds").GetDouble().Should().Be(12.5);

        Store.MediaAssets.Values.Should().HaveCount(3).And.OnlyContain(a => a.Status == MediaAssetStatus.Pending && a.OwnerId == SeedIds.TestUser);
        Factory.Storage.StoredIds.Should().HaveCount(3);
    }

    [Fact]
    public async Task Upload_PurposeDefaultsToPost_AndAvatarIsAccepted()
    {
        (await UploadAsync(null, Png())).StatusCode.Should().Be(HttpStatusCode.Created);
        (await UploadAsync("avatar", Png())).StatusCode.Should().Be(HttpStatusCode.Created);

        Store.MediaAssets.Values.Select(a => a.Purpose).Should().BeEquivalentTo([MediaPurpose.Post, MediaPurpose.Avatar]);
    }
    #endregion

    #region Validation (the limit table)
    [Fact]
    public async Task Upload_ElevenFiles_Is400OnFiles()
    {
        var files = Enumerable.Range(0, 11).Select(i => Png($"{i}.png")).ToArray();

        await AssertFilesErrorAsync(await UploadAsync("post", files));
        AssertNothingLeft();
    }

    [Fact]
    public async Task Upload_TenFiles_AreAccepted()
    {
        var files = Enumerable.Range(0, 10).Select(i => Png($"{i}.png")).ToArray();

        (await UploadAsync("post", files)).StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Upload_NoFiles_Is400OnFiles()
        => await AssertFilesErrorAsync(await UploadAsync("post"));

    [Fact]
    public async Task Upload_ImageOverTenMiB_Is400OnFiles()
    {
        await AssertFilesErrorAsync(await UploadAsync("post", Png(padding: (int)(10 * MiB))));
        AssertNothingLeft();
    }

    [Fact]
    public async Task Upload_ImageExactlyTenMiB_IsAccepted()
    {
        var exact = MediaSamples.Png(800, 600);
        var bytes = new byte[10 * MiB];
        exact.CopyTo(bytes, 0);

        (await UploadAsync("post", ("big.png", bytes, "image/png"))).StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Theory]
    [InlineData(12001, 100)]
    [InlineData(8000, 6251)]
    public async Task Upload_TooManyPixels_Is400OnFiles(int width, int height)
        => await AssertFilesErrorAsync(await UploadAsync("post", Png(width: width, height: height)));

    [Fact]
    public async Task Upload_ExecutableRenamedAsPng_Is400()
    {
        await AssertFilesErrorAsync(await UploadAsync("post", ("photo.png", MediaSamples.Exe(), "image/png")));
        AssertNothingLeft();
    }

    [Theory]
    [InlineData("svg")]
    [InlineData("heic")]
    public async Task Upload_SvgAndHeic_AreRejected(string kind)
    {
        var bytes = kind == "svg" ? MediaSamples.Svg() : MediaSamples.Heic();

        await AssertFilesErrorAsync(await UploadAsync("post", ($"x.{kind}", bytes, kind == "svg" ? "image/svg+xml" : "image/heic")));
    }

    [Fact]
    public async Task Upload_AvatarWithTwoFilesOrVideo_Is400()
    {
        await AssertFilesErrorAsync(await UploadAsync("avatar", Png(), Png()));
        await AssertFilesErrorAsync(await UploadAsync("avatar", Mp4()));
    }

    [Fact]
    public async Task Upload_UnknownPurpose_Is400OnPurpose()
    {
        var response = await UploadAsync("cover", Png());

        await AssertProblemAsync(response, HttpStatusCode.BadRequest, "ValidationFailed");
        (await JsonAsync(response)).GetProperty("errors").TryGetProperty("purpose", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Upload_JsonBody_Is415()
    {
        var client = await LoginAsync(Seed.TestLogin);

        var response = await client.PostAsJsonAsync("/api/media", new { files = Array.Empty<string>() });

        await AssertProblemAsync(response, HttpStatusCode.UnsupportedMediaType, "UnsupportedMediaType");
    }
    #endregion

    #region Body cap & limits configuration
    private sealed class ForgedLengthContent(long length) : HttpContent
    {
        protected override Task SerializeToStreamAsync(Stream stream, TransportContext? context) => Task.CompletedTask;

        protected override bool TryComputeLength(out long computed)
        {
            computed = length;
            return true;
        }
    }

    [Fact]
    public async Task Upload_BodyOver102MiB_Is413_BeforeTheBodyIsRead()
    {
        var client = await LoginAsync(Seed.TestLogin);
        using var content = new ForgedLengthContent(102 * MiB + 1);
        content.Headers.ContentType = new MediaTypeHeaderValue("multipart/form-data") { Parameters = { new NameValueHeaderValue("boundary", "x") } };

        var response = await client.PostAsync("/api/media", content);

        await AssertProblemAsync(response, HttpStatusCode.RequestEntityTooLarge, "PayloadTooLarge");
        Factory.Storage.UploadAttempts.Should().Be(0);
    }

    private static bool IsMediaRoute(RouteEndpoint endpoint) => string.Equals(endpoint.RoutePattern.RawText, "api/media", StringComparison.OrdinalIgnoreCase);

    [Fact]
    public void Upload_EndpointRaisesTheBodyCapTo102MiB_ForThisActionOnly()
    {
        var endpoints = Factory.Services.GetRequiredService<EndpointDataSource>().Endpoints.OfType<RouteEndpoint>().ToList();

        var upload = endpoints.Single(e => e.Metadata.GetMetadata<HttpMethodMetadata>()?.HttpMethods.Contains("POST") == true
                                           && IsMediaRoute(e));
        upload.Metadata.GetMetadata<IRequestSizeLimitMetadata>()!.MaxRequestBodySize.Should().Be(MediaLimits.MaxBodyBytes);
        upload.Metadata.GetMetadata<RequestFormLimitsAttribute>()!.MultipartBodyLengthLimit.Should().Be(MediaLimits.MaxBodyBytes);

        endpoints.Where(e => !IsMediaRoute(e))
            .Where(e => e.Metadata.GetMetadata<IRequestSizeLimitMetadata>() is { MaxRequestBodySize: MediaLimits.MaxBodyBytes })
            .Should().BeEmpty("only the upload action may take a body this big");
    }
    #endregion

    #region Provider & capacity
    [Fact]
    public async Task Upload_StorageUnavailable_Is503_AndClean()
    {
        Factory.Storage.BeforeUpload = (_, _) => throw new MediaStorageUnavailableException("down");

        await AssertProblemAsync(await UploadAsync("post", Png(), Png()), HttpStatusCode.ServiceUnavailable, "MediaStorageUnavailable");
        AssertNothingLeft();
    }

    [Fact]
    public async Task Upload_ProviderRejection_Is400_NotA500()
    {
        Factory.Storage.BeforeUpload = (_, _) => throw new MediaRejectedException("File size too large.");

        await AssertProblemAsync(await UploadAsync("post", Png()), HttpStatusCode.BadRequest, "ValidationFailed");
        AssertNothingLeft();
    }

    [Fact]
    public async Task Upload_SecondConcurrentRequestOfTheUser_Is429WithRetryAfter()
    {
        var hold = new TaskCompletionSource();
        var started = new TaskCompletionSource();
        Factory.Storage.BeforeUpload = async (_, _) =>
        {
            started.TrySetResult();
            await hold.Task;
        };

        var client = await LoginAsync(Seed.TestLogin);
        using var firstForm = Form("post", Png());
        var first = client.PostAsync("/api/media", firstForm);
        await started.Task;

        using var secondForm = Form("post", Png());
        var second = await client.PostAsync("/api/media", secondForm);

        await AssertProblemAsync(second, HttpStatusCode.TooManyRequests, "TooManyRequests");
        second.Headers.RetryAfter!.Delta.Should().Be(TimeSpan.FromSeconds(5));

        hold.SetResult();
        (await first).StatusCode.Should().Be(HttpStatusCode.Created);
    }

    [Fact]
    public async Task Upload_QuotaOf30Pending_Is400()
    {
        for (var i = 0; i < 30; i++)
        {
            var asset = MediaAsset.Create(SeedIds.TestUser, MediaKind.Image, MediaPurpose.Post, "t");
            asset.MarkUploaded("https://res.cloudinary.com/demo/image/upload/x.jpg", null, 1, 1, null, 1);
            Store.MediaAssets.Add(asset);
        }

        await AssertProblemAsync(await UploadAsync("post", Png()), HttpStatusCode.BadRequest, "ValidationFailed");
        Factory.Storage.UploadAttempts.Should().Be(0);
    }
    #endregion

    #region Privacy
    [Fact]
    public async Task Upload_Response_NeverLeaksTheFileNameOrSecrets()
    {
        var response = await UploadAsync("post", Png("my-private-holiday.png"));

        (await response.Content.ReadAsStringAsync()).Should().NotContain("holiday").And.NotContainEquivalentOf("secret");
        Factory.Logs.Entries.Should().NotContain(e => e.Message.Contains("ApiSecret", StringComparison.OrdinalIgnoreCase));
    }
    #endregion
}
