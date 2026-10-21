using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.Media;

public interface IMediaAssetRepository : IRepository<MediaAsset, MediaAssetId>
{
    /// <summary>
    /// Tracked assets by id (unknown ids are simply absent).
    /// </summary>
    Task<IReadOnlyList<MediaAsset>> GetByIdsAsync(IReadOnlyCollection<MediaAssetId> ids, CancellationToken cancellationToken = default);

    /// <summary>
    /// Live quota count: assets of the owner still Uploading or Pending.
    /// </summary>
    Task<int> CountReservedAsync(UserId ownerId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tracked rows ready for deletion: Uploading older than the lease, Pending older than the TTL, Released past the grace,
    /// Deleting whose lease expired (oldest first, at most <paramref name="batch"/>).
    /// </summary>
    Task<IReadOnlyList<MediaAsset>> GetSweepBatchAsync(MediaSweepWindow window, int batch, CancellationToken cancellationToken = default);

    /// <summary>
    /// Tracked Attached avatar asset of the owner with this url (null when the avatar is external).
    /// </summary>
    Task<MediaAsset?> GetAttachedAvatarAsync(UserId ownerId, string url, CancellationToken cancellationToken = default);

    /// <summary>
    /// Bumps the owner's quota token so a concurrent reserve fails on save (<c>ConcurrencyConflictException</c>); false when the user is gone.
    /// </summary>
    Task<bool> BumpQuotaTokenAsync(UserId ownerId, CancellationToken cancellationToken = default);
}

/// <summary>
/// Cut-off instants of the sweep (a row is eligible when its relevant timestamp is older than the cut-off).
/// </summary>
public sealed record MediaSweepWindow(DateTime UploadingBefore, DateTime PendingBefore, DateTime ReleasedBefore, DateTime DeletingBefore);
