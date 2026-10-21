using YSocial.Domain.Media;

namespace YSocial.Domain.Posts;

/// <summary>
/// Immutable snapshot of an attached media asset (owned by <see cref="Post"/>, identified by (post, position)).
/// </summary>
public sealed class PostMedia
{
    public int Position { get; private set; }
    public MediaAssetId MediaId { get; private set; }
    public MediaKind Kind { get; private set; }
    public string Url { get; private set; }
    public string? PosterUrl { get; private set; }
    public int Width { get; private set; }
    public int Height { get; private set; }
    public double? DurationSeconds { get; private set; }
    public long Bytes { get; private set; }

#pragma warning disable CS8618
    private PostMedia() { }
#pragma warning restore CS8618

    private PostMedia(MediaAssetId mediaId, MediaKind kind, string url, string? posterUrl, int width, int height, double? durationSeconds, long bytes)
    {
        MediaId = mediaId;
        Kind = kind;
        Url = url;
        PosterUrl = posterUrl;
        Width = width;
        Height = height;
        DurationSeconds = durationSeconds;
        Bytes = bytes;
    }

    public static PostMedia Create(MediaAssetId mediaId, MediaKind kind, string url, string? posterUrl, int width, int height, double? durationSeconds, long bytes)
        => new(mediaId, kind, url, posterUrl, width, height, durationSeconds, bytes);

    // Position = index in the create request, assigned by the owning post
    internal void Place(int position) => Position = position;
}
