using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Media;

/// <summary>
/// Saves a media row in any status together with its remote file (what the real upload leaves behind).
/// </summary>
internal static class MediaArrange
{
    public static async Task<MediaAsset> AssetAsync(
        ApiFactory factory,
        string status = "Pending",
        UserId? owner = null,
        MediaKind? kind = null,
        MediaPurpose? purpose = null,
        double? duration = null)
    {
        var who = owner ?? SeedIds.TestUser;
        var mediaKind = kind ?? MediaKind.Image;
        var mediaPurpose = purpose ?? MediaPurpose.Post;
        var asset = MediaAsset.Create(who, mediaKind, mediaPurpose, "test");

        if (status != "Uploading")
        {
            var url = $"https://res.cloudinary.com/{FakeMediaStorage.CloudName}/{(mediaKind == MediaKind.Video ? "video" : "image")}/upload/v1/{asset.PublicId}.{(mediaKind == MediaKind.Video ? "mp4" : "jpg")}";
            asset.MarkUploaded(url, mediaKind == MediaKind.Video ? url.Replace(".mp4", ".jpg") : null, 640, 480, mediaKind == MediaKind.Video ? duration ?? 5 : null, 1234);
        }

        switch (status)
        {
            case "Attached": asset.MarkAttached(who, mediaPurpose); break;
            case "Released": asset.MarkAttached(who, mediaPurpose); asset.Release(); break;
            case "Deleting": asset.Claim(DateTime.UtcNow); break;
        }

        Store.MediaAssets.Add(asset);
        await factory.Storage.UploadAsync(new MediaUpload(asset.Id, asset.PublicId, mediaKind, mediaPurpose, "image/png", new MemoryStream([1])), default);

        return asset;
    }
}
