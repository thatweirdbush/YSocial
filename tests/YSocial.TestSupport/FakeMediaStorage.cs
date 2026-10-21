using System.Collections.Concurrent;
using YSocial.Application.Abstractions.Media;
using YSocial.Domain.Media;
using YSocial.Infrastructure.Media;

namespace YSocial.TestSupport;

/// <summary>
/// In-memory <see cref="IMediaStorage"/> with fault injection. Real Cloudinary is only used by the manual smoke.
/// </summary>
public sealed class FakeMediaStorage : IMediaStorage
{
    public const string CloudName = "demo";

    private readonly ConcurrentDictionary<string, FakeFile> _files = new();
    private int _uploadAttempts;

    /// <summary>
    /// Files currently stored, by public id.
    /// </summary>
    public IReadOnlyDictionary<string, FakeFile> Files => _files;

    public IReadOnlyCollection<string> StoredIds => _files.Keys.ToList();

    /// <summary>
    /// Upload calls started (successful or not).
    /// </summary>
    public int UploadAttempts => _uploadAttempts;

    public ConcurrentQueue<string> DeleteRequests { get; } = new();

    #region Fault injection
    /// <summary>
    /// Runs before each upload with the 1-based attempt number; throw to fail it (nothing is stored).
    /// </summary>
    public Func<MediaUpload, int, Task>? BeforeUpload { get; set; }

    /// <summary>
    /// Runs after the file was stored with the attempt number; throw to mimic a provider that finished but whose answer was lost.
    /// </summary>
    public Func<MediaUpload, int, Task>? AfterStore { get; set; }

    /// <summary>
    /// When true every delete throws <see cref="MediaStorageUnavailableException"/> (files stay).
    /// </summary>
    public bool FailDeletes { get; set; }

    /// <summary>
    /// Dimensions & duration the fake reports (override per test; default 800x600, videos 1920x1080 for 12.5 s).
    /// </summary>
    public Func<MediaUpload, (int Width, int Height, double? Duration)>? Shape { get; set; }
    #endregion

    public async Task<StoredMedia> UploadAsync(MediaUpload upload, CancellationToken cancellationToken)
    {
        var attempt = Interlocked.Increment(ref _uploadAttempts);

        if (BeforeUpload is not null) await BeforeUpload(upload, attempt);
        cancellationToken.ThrowIfCancellationRequested();

        // Consumes the stream like a real provider would
        using var buffer = new MemoryStream();
        await upload.Content.CopyToAsync(buffer, cancellationToken);

        var (width, height, duration) = Shape?.Invoke(upload)
                                        ?? (upload.Kind == MediaKind.Video ? (1920, 1080, 12.5) : (800, 600, null));

        var video = upload.Kind == MediaKind.Video;
        var extension = video ? "mp4" : "jpg";
        var url = $"https://res.cloudinary.com/{CloudName}/{(video ? "video" : "image")}/upload/v1/{upload.PublicId}.{extension}";

        _files[upload.PublicId] = new FakeFile(upload.Kind, buffer.Length, url);

        if (AfterStore is not null) await AfterStore(upload, attempt);

        return new StoredMedia(upload.PublicId, url, video ? CloudinaryUrl.PosterOf(url) : null, width, height, duration, buffer.Length, extension);
    }

    public Task DeleteAsync(IReadOnlyCollection<StoredMediaRef> refs, CancellationToken cancellationToken)
    {
        foreach (var reference in refs) DeleteRequests.Enqueue(reference.PublicId);

        if (FailDeletes) throw new MediaStorageUnavailableException("fake delete failure");

        foreach (var reference in refs) _files.TryRemove(reference.PublicId, out _);

        return Task.CompletedTask;
    }

    public bool OwnsUrl(string? url) => CloudinaryUrl.Owns(url, CloudName);

    public bool IsAvailable => true;

    public void Reset()
    {
        _files.Clear();
        Interlocked.Exchange(ref _uploadAttempts, 0);
        DeleteRequests.Clear();
        BeforeUpload = null;
        AfterStore = null;
        FailDeletes = false;
        Shape = null;
    }
}

public sealed record FakeFile(MediaKind Kind, long Bytes, string Url);
