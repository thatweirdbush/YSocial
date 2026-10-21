using System.Net;
using CloudinaryDotNet;
using CloudinaryDotNet.Actions;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;

namespace YSocial.Infrastructure.Media;

/// <summary>
/// Cloudinary implementation of <see cref="IMediaStorage"/>. Keys never reach logs or exception text.
/// </summary>
public sealed class CloudinaryMediaStorage : IMediaStorage
{
    private const int ImageMaxSide = 2048;
    private const int AvatarSide = 512;
    private const int ChunkSize = 20 * 1024 * 1024;
    private const int TimeoutMilliseconds = 10 * 60 * 1000;

    private readonly Cloudinary _cloudinary;
    private readonly string _cloudName;
    private readonly ILogger<CloudinaryMediaStorage> _logger;

    public CloudinaryMediaStorage(CloudinarySettings settings, ILogger<CloudinaryMediaStorage> logger)
    {
        _cloudName = settings.CloudName;
        _logger = logger;
        _cloudinary = new Cloudinary(new Account(settings.CloudName, settings.ApiKey, settings.ApiSecret));
        _cloudinary.Api.Secure = true;
        _cloudinary.Api.Timeout = TimeoutMilliseconds;
    }

    #region Upload
    /// <summary>
    /// Incoming transformation: stored bytes are re-encoded, capped (avatars cropped square) and stripped of EXIF/GPS (<c>fl_strip_profile</c>).
    /// Videos are stored as uploaded.
    /// </summary>
    public static Transformation? IncomingTransformation(MediaKind kind, MediaPurpose purpose)
    {
        if (kind == MediaKind.Video) return null;

        return purpose == MediaPurpose.Avatar
            ? new Transformation().Crop("fill").Gravity("auto").Width(AvatarSide).Height(AvatarSide).Flags("strip_profile")
            : new Transformation().Crop("limit").Width(ImageMaxSide).Height(ImageMaxSide).Flags("strip_profile");
    }

    public async Task<StoredMedia> UploadAsync(MediaUpload upload, CancellationToken cancellationToken)
    {
        try
        {
            return upload.Kind == MediaKind.Video
                ? await UploadVideoAsync(upload, cancellationToken)
                : await UploadImageAsync(upload, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException or IOException or TaskCanceledException or TimeoutException
                                          && !cancellationToken.IsCancellationRequested)
        {
            _logger.LogWarning("Media provider call failed ({ExceptionType})", exception.GetType().Name);
            throw new MediaStorageUnavailableException("The media provider could not be reached.", exception);
        }
    }

    private async Task<StoredMedia> UploadImageAsync(MediaUpload upload, CancellationToken cancellationToken)
    {
        var parameters = new ImageUploadParams
        {
            File = new FileDescription(upload.Id.Value.ToString("N"), upload.Content),
            PublicId = upload.PublicId,
            Overwrite = false,
            UniqueFilename = false,
            Transformation = IncomingTransformation(upload.Kind, upload.Purpose)
        };

        var result = await _cloudinary.UploadAsync(parameters, cancellationToken);
        return await ToStoredAsync(upload, result, result.ResourceType, result.Format, result.Width, result.Height, null, result.Bytes, null, cancellationToken);
    }

    private async Task<StoredMedia> UploadVideoAsync(MediaUpload upload, CancellationToken cancellationToken)
    {
        var parameters = new VideoUploadParams
        {
            File = new FileDescription(upload.Id.Value.ToString("N"), upload.Content),
            PublicId = upload.PublicId,
            Overwrite = false,
            UniqueFilename = false
        };

        var result = upload.Content.CanSeek && upload.Content.Length <= ChunkSize
            ? await _cloudinary.UploadAsync(parameters, cancellationToken)
            : await _cloudinary.UploadLargeAsync(parameters, ChunkSize, cancellationToken);

        return await ToStoredAsync(upload, result, result.ResourceType, result.Format, result.Width, result.Height, result.Duration, result.Bytes, CloudinaryUrl.PosterOf, cancellationToken);
    }

    private async Task<StoredMedia> ToStoredAsync(
        MediaUpload upload,
        UploadResult result,
        string? resourceType,
        string? format,
        int width,
        int height,
        double? duration,
        long bytes,
        Func<string, string>? poster,
        CancellationToken cancellationToken)
    {
        if (result.Error is not null)
        {
            throw MapError(result);
        }

        var expected = upload.Kind == MediaKind.Video ? "video" : "image";
        if (!string.Equals(resourceType, expected, StringComparison.Ordinal) || result.SecureUrl is null)
        {
            // The sniffed kind and the provider disagree: nothing of it may stay
            await TryDeleteAsync(upload, cancellationToken);
            throw new MediaRejectedException($"The file is not a valid {expected}.");
        }

        var url = result.SecureUrl.ToString();

        return new StoredMedia(upload.PublicId, url, poster?.Invoke(url), width, height, duration, bytes, format ?? string.Empty);
    }

    private static Exception MapError(UploadResult result)
    {
        // 400 = the provider refused THIS file (size, format); anything else (keys, quota, outage) = storage unusable
        return result.StatusCode == HttpStatusCode.BadRequest
            ? new MediaRejectedException(result.Error.Message)
            : new MediaStorageUnavailableException("The media provider refused the request.");
    }

    private async Task TryDeleteAsync(MediaUpload upload, CancellationToken cancellationToken)
    {
        try
        {
            await DeleteAsync([new StoredMediaRef(upload.PublicId, upload.Kind)], CancellationToken.None);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // The write-ahead row stays Uploading/Deleting: the sweep removes the file later
            _logger.LogWarning("Could not delete a rejected upload now ({ExceptionType}); the sweep will", exception.GetType().Name);
        }
    }
    #endregion

    #region Delete
    public async Task DeleteAsync(IReadOnlyCollection<StoredMediaRef> refs, CancellationToken cancellationToken)
    {
        foreach (var group in refs.GroupBy(r => r.Kind))
        {
            var type = group.Key == MediaKind.Video ? ResourceType.Video : ResourceType.Image;
            var ids = group.Select(r => r.PublicId).Distinct().ToArray();

            DelResResult result;
            try
            {
                result = await _cloudinary.DeleteResourcesAsync(type, ids).WaitAsync(cancellationToken);
            }
            catch (Exception exception) when (exception is HttpRequestException or IOException or TaskCanceledException or TimeoutException
                                              && !cancellationToken.IsCancellationRequested)
            {
                throw new MediaStorageUnavailableException("The media provider could not be reached.", exception);
            }

            // Missing = success: the file is already gone
            if (result.Error is not null
                || ids.Any(id => result.Deleted is null || !result.Deleted.TryGetValue(id, out var state) || state is not ("deleted" or "not_found")))
            {
                throw new MediaStorageUnavailableException("The media provider did not confirm the deletion.");
            }
        }
    }
    #endregion

    public bool OwnsUrl(string? url) => CloudinaryUrl.Owns(url, _cloudName);

    public bool IsAvailable => true;
}
