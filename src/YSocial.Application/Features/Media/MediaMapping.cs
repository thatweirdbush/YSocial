using YSocial.Application.Models;
using YSocial.Domain.Media;
using YSocial.Domain.Posts;

namespace YSocial.Application.Features.Media;

internal static class MediaMapping
{
    public static MediaDto ToDto(MediaAsset asset)
        => new(asset.Id.Value, KindName(asset.Kind), asset.Url!, asset.PosterUrl, asset.Width!.Value, asset.Height!.Value, asset.DurationSeconds, asset.Bytes!.Value);

    public static MediaDto ToDto(PostMedia media)
        => new(media.MediaId.Value, KindName(media.Kind), media.Url, media.PosterUrl, media.Width, media.Height, media.DurationSeconds, media.Bytes);

    public static string KindName(MediaKind kind) => kind == MediaKind.Video ? "video" : "image";
}
