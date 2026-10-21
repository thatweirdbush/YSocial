using YSocial.Application.Abstractions.Media;

namespace YSocial.Infrastructure.Media;

/// <summary>
/// Used when <c>Cloudinary:*</c> keys are missing: startup never fails, everything except media keeps working.
/// </summary>
public sealed class UnavailableMediaStorage : IMediaStorage
{
    private const string Reason = "Media storage is not configured.";

    public Task<StoredMedia> UploadAsync(MediaUpload upload, CancellationToken cancellationToken)
        => throw new MediaStorageUnavailableException(Reason);

    public Task DeleteAsync(IReadOnlyCollection<StoredMediaRef> refs, CancellationToken cancellationToken)
        => throw new MediaStorageUnavailableException(Reason);

    public bool OwnsUrl(string? url) => false;
}
