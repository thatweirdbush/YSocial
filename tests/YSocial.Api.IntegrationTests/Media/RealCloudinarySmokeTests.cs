using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Xunit;
using Xunit.Abstractions;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;
using YSocial.Infrastructure.Media;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Media;

/// <summary>
/// Runs ONLY when <c>YSOCIAL_SMOKE_CLOUDINARY_DIR</c> points at a folder with the sample files (a-gps.jpg, b.png, v.mp4, avatar1.png,
/// avatar2.png, abandoned.png) and the Cloudinary keys exist in user-secrets. It talks to the REAL Cloudinary (remote path prefix
/// <c>ysocial/smoke/</c>, removed at the end) through the real HTTP pipeline on a throw-away SQLite database.
/// Keys are never printed or logged.
/// </summary>
public sealed class SmokeFactAttribute : FactAttribute
{
    public const string EnvironmentVariable = "YSOCIAL_SMOKE_CLOUDINARY_DIR";

    public SmokeFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(EnvironmentVariable)))
        {
            Skip = $"Set {EnvironmentVariable} to run the real Cloudinary smoke";
        }
    }
}

[Collection(ApiCollection.Name)]
public class RealCloudinarySmokeTests(ITestOutputHelper output)
{
    private const string Prefix = "ysocial/smoke/";

    private static string Sample(string name) => Path.Combine(Environment.GetEnvironmentVariable(SmokeFactAttribute.EnvironmentVariable)!, name);

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        var text = await response.Content.ReadAsStringAsync();
        response.IsSuccessStatusCode.Should().BeTrue(text);
        using var doc = JsonDocument.Parse(text);
        return doc.RootElement.Clone();
    }

    private static MultipartFormDataContent Form(string purpose, params string[] samples)
    {
        var form = new MultipartFormDataContent { { new StringContent(purpose), "purpose" } };
        foreach (var name in samples)
        {
            var part = new ByteArrayContent(File.ReadAllBytes(Sample(name)));
            part.Headers.ContentType = new MediaTypeHeaderValue(name.EndsWith(".mp4") ? "video/mp4" : name.EndsWith(".png") ? "image/png" : "image/jpeg");
            form.Add(part, "files", name);
        }

        return form;
    }

    private static bool HasExif(byte[] bytes) => bytes.AsSpan().IndexOf("Exif\0\0"u8) >= 0;

    private static string Delivered(string url, int width) => url.Replace("/upload/", $"/upload/f_auto,q_auto,c_limit,w_{width}/", StringComparison.Ordinal);

    [SmokeFact]
    public async Task Upload_Post_Avatar_Discard_Sweep_AgainstRealCloudinary()
    {
        Store.Reset();
        var report = new StringBuilder();
        void Note(string line)
        {
            report.AppendLine(line);
            output.WriteLine(line);
        }

        var clock = new ManualTimeProvider();
        using var factory = new SmokeFactory(Store.Database);
        var configuration = factory.Services.GetRequiredService<IConfiguration>();
        var cloudinary = new Cloudinary(new Account(configuration["Cloudinary:CloudName"], configuration["Cloudinary:ApiKey"], configuration["Cloudinary:ApiSecret"]));
        var storage = factory.Services.GetRequiredService<IMediaStorage>();
        storage.IsAvailable.Should().BeTrue("the keys must be in user-secrets for the smoke");
        using var plain = new HttpClient();

        async Task<bool> ExistsRemotely(string publicId, ResourceType type)
        {
            var result = await cloudinary.GetResourceAsync(new GetResourceParams(publicId) { ResourceType = type });
            return result.StatusCode == HttpStatusCode.OK;
        }

        // Every remote key this run creates: checked one by one at the end (the prefix listing alone could hide an error)
        var created = new List<(string Key, ResourceType Type)>();
        void Track(string key, ResourceType type = ResourceType.Image) => created.Add((key, type));

        try
        {
            var client = await AuthHelper.LoginAsync(factory, Seed.TestLogin);

            // 1. upload 2 images + 1 video
            var uploaded = await JsonAsync(await client.PostAsync("/api/media", Form("post", "a-gps.jpg", "b.png", "v.mp4")));
            var items = uploaded.EnumerateArray().ToList();
            items.Should().HaveCount(3);
            Note($"upload: {string.Join(", ", items.Select(i => $"{i.GetProperty("kind").GetString()} {i.GetProperty("width").GetInt32()}x{i.GetProperty("height").GetInt32()} {i.GetProperty("bytes").GetInt64()}B"))}");
            var rows = Store.MediaAssets.Values;
            rows.Should().HaveCount(3).And.OnlyContain(r => r.Status == MediaAssetStatus.Pending && r.PublicId.StartsWith(Prefix));
            foreach (var row in rows) Track(row.PublicId, row.Kind == MediaKind.Video ? ResourceType.Video : ResourceType.Image);
            foreach (var row in rows) (await ExistsRemotely(row.PublicId, row.Kind == MediaKind.Video ? ResourceType.Video : ResourceType.Image)).Should().BeTrue(row.PublicId);

            // 2. delivery in the browser sense + EXIF/GPS proof (stored asset and delivered variant)
            var jpeg = items[0];
            var stored = await plain.GetByteArrayAsync(jpeg.GetProperty("url").GetString());
            var request = new HttpRequestMessage(System.Net.Http.HttpMethod.Get, Delivered(jpeg.GetProperty("url").GetString()!, 400));
            request.Headers.Accept.ParseAdd("image/jpeg");
            var variant = await (await plain.SendAsync(request)).Content.ReadAsByteArrayAsync();
            Note($"EXIF: source sample had an Exif APP1 segment; stored asset has Exif = {HasExif(stored)}, delivered variant has Exif = {HasExif(variant)}");
            HasExif(stored).Should().BeFalse("fl_strip_profile must strip metadata from the stored asset");
            HasExif(variant).Should().BeFalse("delivery must not bring metadata back");
            stored.Length.Should().BeLessThan(File.ReadAllBytes(Sample("a-gps.jpg")).Length + 1);

            var video = items[2];
            (await plain.GetAsync(video.GetProperty("url").GetString())).StatusCode.Should().Be(HttpStatusCode.OK);
            (await plain.GetAsync(video.GetProperty("posterUrl").GetString())).Content.Headers.ContentType!.MediaType.Should().StartWith("image/");
            Note("delivery: image, variant, video and poster answered 200");

            // 3. post with the media, then read it back
            var ids = items.Select(i => i.GetProperty("id").GetGuid()).ToArray();
            var post = await JsonAsync(await client.PostAsJsonAsync("/api/posts", new { content = "smoke post", mediaIds = ids }));
            post.GetProperty("media").GetArrayLength().Should().Be(3);
            Store.MediaAssets.Values.Should().OnlyContain(r => r.Status == MediaAssetStatus.Attached);
            Note("post: created with 3 attached media");

            // 4. discard one pending asset: gone remotely
            var pending = await JsonAsync(await client.PostAsync("/api/media", Form("post", "abandoned.png")));
            var pendingId = pending[0].GetProperty("id").GetGuid();
            var pendingKey = Store.MediaAssets[new MediaAssetId(pendingId)].PublicId;
            Track(pendingKey);
            (await client.DeleteAsync($"/api/media/{pendingId}")).StatusCode.Should().Be(HttpStatusCode.NoContent);
            (await ExistsRemotely(pendingKey, ResourceType.Image)).Should().BeFalse();
            Store.MediaAssets.ContainsKey(new MediaAssetId(pendingId)).Should().BeFalse();
            Note("discard: 204, row and remote file gone (Admin API)");

            // 5. avatar upload and replace
            var first = (await JsonAsync(await client.PostAsync("/api/media", Form("avatar", "avatar1.png"))))[0];
            (await client.PutAsJsonAsync("/api/users/profiles/me", new { displayName = "Smoke", avatarMediaId = first.GetProperty("id").GetGuid() })).StatusCode.Should().Be(HttpStatusCode.OK);
            var second = (await JsonAsync(await client.PostAsync("/api/media", Form("avatar", "avatar2.png"))))[0];
            (await client.PutAsJsonAsync("/api/users/profiles/me", new { displayName = "Smoke", avatarMediaId = second.GetProperty("id").GetGuid() })).StatusCode.Should().Be(HttpStatusCode.OK);
            var oldKey = Store.MediaAssets[new MediaAssetId(first.GetProperty("id").GetGuid())].PublicId;
            Track(oldKey);
            Track(Store.MediaAssets[new MediaAssetId(second.GetProperty("id").GetGuid())].PublicId);
            Store.MediaAssets[new MediaAssetId(first.GetProperty("id").GetGuid())].Status.Should().Be(MediaAssetStatus.Released);
            Note($"avatar: replaced; old asset Released, avatar url = our storage ({storage.OwnsUrl(Store.Users[SeedIds.TestUser].ProfileInfo.AvatarUrl)})");

            // 6. sweep: released (after the grace) and an abandoned pending (after the TTL)
            var abandoned = (await JsonAsync(await client.PostAsync("/api/media", Form("post", "abandoned.png"))))[0];
            var abandonedKey = Store.MediaAssets[new MediaAssetId(abandoned.GetProperty("id").GetGuid())].PublicId;
            Track(abandonedKey);
            clock.Advance(TimeSpan.FromHours(25));
            var sweeper = ActivatorUtilities.CreateInstance<MediaCleanupProcessor>(factory.Services, (TimeProvider)clock);
            var swept = await sweeper.RunAsync(default);
            Note($"sweep: claimed {swept.Claimed}, deleted {swept.Deleted}, failed {swept.Failed}, skipped {swept.Skipped}");
            swept.Deleted.Should().Be(2);
            (await ExistsRemotely(oldKey, ResourceType.Image)).Should().BeFalse("the released avatar is deleted remotely");
            (await ExistsRemotely(abandonedKey, ResourceType.Image)).Should().BeFalse("the abandoned upload is deleted remotely");
            Store.MediaAssets.Values.Should().OnlyContain(r => r.Status == MediaAssetStatus.Attached, "attached media is never swept");
        }
        finally
        {
            // Cleanup of everything this run created (prefix is ours only), then report what is left
            var refs = Store.MediaAssets.Values.Select(r => new StoredMediaRef(r.PublicId, r.Kind)).ToList();
            if (refs.Count > 0) await storage.DeleteAsync(refs, default);

            var stillThere = new List<string>();
            foreach (var (key, type) in created.Distinct())
            {
                if (await ExistsRemotely(key, type)) stillThere.Add(key);
            }

            Note($"cleanup: {created.Distinct().Count()} remote keys created by this run, {stillThere.Count} still present");
            stillThere.Should().BeEmpty("the smoke must leave nothing in Cloudinary");

            var path = Path.Combine(Path.GetDirectoryName(Sample("x"))!, "smoke-report.txt");
            await File.WriteAllTextAsync(path, report.ToString());
        }
    }

    /// <summary>Real storage under its own remote prefix (never mixes with development data).</summary>
    private sealed class SmokeFactory(SqliteTestDatabase database) : ApiFactory(database, StorageMode.Real)
    {
        protected override void ConfigureWebHost(Microsoft.AspNetCore.Hosting.IWebHostBuilder builder)
        {
            base.ConfigureWebHost(builder);
            builder.UseSetting("Media:Environment", "smoke");
        }
    }
}
