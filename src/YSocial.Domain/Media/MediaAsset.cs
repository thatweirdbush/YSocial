using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Media.Rules;
using YSocial.Domain.Users;

namespace YSocial.Domain.Media;

/// <summary>
/// Write-ahead record of one Cloudinary file: the row exists BEFORE the remote file does.
/// <see cref="Version"/> is the concurrency token: attach, discard, release and sweep claim race on it, one wins.
/// </summary>
public class MediaAsset : AggregateRoot<MediaAssetId>
{
    #region Properties
    public UserId OwnerId { get; private set; }
    public MediaKind Kind { get; private set; }
    public MediaPurpose Purpose { get; private set; }

    /// <summary>
    /// Remote key derived from the asset id BEFORE the upload.
    /// </summary>
    public string PublicId { get; private set; }
    public string? Url { get; private set; }
    public string? PosterUrl { get; private set; }
    public int? Width { get; private set; }
    public int? Height { get; private set; }
    public double? DurationSeconds { get; private set; }

    /// <summary>
    /// Null while <see cref="MediaAssetStatus.Uploading"/>.
    /// </summary>
    public long? Bytes { get; private set; }
    public MediaAssetStatus Status { get; private set; }
    public DateTime CreatedAt { get; private set; }
    public DateTime StatusChangedAt { get; private set; }
    public int CleanupAttempts { get; private set; }
    public int Version { get; private set; }
    #endregion

#pragma warning disable CS8618
    private MediaAsset() { }
#pragma warning restore CS8618

    private MediaAsset(UserId ownerId, MediaKind kind, MediaPurpose purpose, string environment)
    {
        Id = MediaAssetId.New();
        OwnerId = ownerId;
        Kind = kind;
        Purpose = purpose;
        PublicId = BuildPublicId(environment, purpose, Id);
        Status = MediaAssetStatus.Uploading;
        CreatedAt = DateTime.UtcNow;
        StatusChangedAt = CreatedAt;
    }

    #region Methods
    /// <summary>
    /// <c>ysocial/{env}/{posts|avatars}/{id:N}</c>; file names never reach the key.
    /// </summary>
    public static string BuildPublicId(string environment, MediaPurpose purpose, MediaAssetId id)
        => $"ysocial/{environment}/{(purpose == MediaPurpose.Avatar ? "avatars" : "posts")}/{id.Value:N}";

    public static MediaAsset Create(UserId ownerId, MediaKind kind, MediaPurpose purpose, string environment)
        => new(ownerId, kind, purpose, environment);

    /// <summary>
    /// Uploading -> Pending: the remote file exists.
    /// </summary>
    public void MarkUploaded(string url, string? posterUrl, int width, int height, double? durationSeconds, long bytes)
    {
        Transition(MediaAssetStatus.Pending, Status == MediaAssetStatus.Uploading);

        Url = url;
        PosterUrl = posterUrl;
        Width = width;
        Height = height;
        DurationSeconds = durationSeconds;
        Bytes = bytes;
    }

    /// <summary>
    /// Pending -> Attached (post create or avatar update); foreign, wrong purpose or not pending = not found.
    /// </summary>
    public void MarkAttached(UserId requesterId, MediaPurpose purpose)
    {
        CheckRule(new MediaMustBePendingForOwnerRule(OwnerId == requesterId, Purpose == purpose, Status == MediaAssetStatus.Pending));

        Transition(MediaAssetStatus.Attached, true);
    }

    /// <summary>
    /// Attached -> Released (no longer referenced by an avatar); deleted later by the sweep after a grace period.
    /// </summary>
    public void Release()
        => Transition(MediaAssetStatus.Released, Status == MediaAssetStatus.Attached);

    /// <summary>
    /// Own Pending asset -> Deleting (explicit discard); anything else = not found.
    /// </summary>
    public void Discard(UserId requesterId, DateTime now)
    {
        CheckRule(new MediaMustBePendingForOwnerRule(OwnerId == requesterId, true, Status == MediaAssetStatus.Pending));

        Transition(MediaAssetStatus.Deleting, true, now);
    }

    /// <summary>
    /// Uploading | Pending | Released | Deleting (lease expired, re-claim) -> Deleting; Attached is never deleted.
    /// </summary>
    public void Claim(DateTime now)
        => Transition(MediaAssetStatus.Deleting, Status != MediaAssetStatus.Attached, now);

    /// <summary>
    /// Remote delete failed: stay Deleting, count the attempt, restart the lease.
    /// </summary>
    public void RecordCleanupFailure(DateTime now)
    {
        Transition(MediaAssetStatus.Deleting, Status == MediaAssetStatus.Deleting, now);

        CleanupAttempts++;
    }

    private void Transition(MediaAssetStatus to, bool allowed, DateTime? now = null)
    {
        CheckRule(new MediaStatusTransitionRule(Status.Name, to.Name, allowed));

        Status = to;
        StatusChangedAt = now ?? DateTime.UtcNow;
        Version++;
    }
    #endregion
}
