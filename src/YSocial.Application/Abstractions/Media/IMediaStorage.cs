using YSocial.Domain.Media;

namespace YSocial.Application.Abstractions.Media;

/// <summary>
/// Remote file store behind the media feature (Cloudinary today, swappable).
/// </summary>
public interface IMediaStorage
{
    /// <summary>
    /// Uploads under <see cref="MediaUpload.PublicId"/>. Throws <see cref="MediaRejectedException"/> when the provider refuses the file
    /// (or it is not the sniffed kind) &amp; <see cref="MediaStorageUnavailableException"/> when the provider cannot be used.
    /// </summary>
    Task<StoredMedia> UploadAsync(MediaUpload upload, CancellationToken cancellationToken);

    /// <summary>
    /// Deletes the remote files; an already missing file counts as deleted.
    /// </summary>
    Task DeleteAsync(IReadOnlyCollection<StoredMediaRef> refs, CancellationToken cancellationToken);

    /// <summary>
    /// True only for urls of OUR storage (strict parse, never a prefix check).
    /// </summary>
    bool OwnsUrl(string? url);

    /// <summary>
    /// False for the stand-in used when the provider keys are missing (uploads and the sweep skip the provider).
    /// </summary>
    bool IsAvailable { get; }
}

/// <param name="PublicId">Remote key derived from the asset id before the upload.</param>
public sealed record MediaUpload(MediaAssetId Id, string PublicId, MediaKind Kind, MediaPurpose Purpose, string ContentType, Stream Content);

/// <param name="Url">Delivery url WITHOUT transformation.</param>
public sealed record StoredMedia(
    string PublicId,
    string Url,
    string? PosterUrl,
    int Width,
    int Height,
    double? DurationSeconds,
    long Bytes,
    string Format);

public sealed record StoredMediaRef(string PublicId, MediaKind Kind);
