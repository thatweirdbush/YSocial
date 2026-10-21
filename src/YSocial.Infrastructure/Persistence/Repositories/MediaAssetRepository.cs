using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Media;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class MediaAssetRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<MediaAsset, MediaAssetId>(db, unitOfWork), IMediaAssetRepository
{
    public async Task<IReadOnlyList<MediaAsset>> GetByIdsAsync(IReadOnlyCollection<MediaAssetId> ids, CancellationToken cancellationToken = default)
    {
        var wanted = ids.Distinct().ToList();
        return await Set.Where(a => wanted.Contains(a.Id)).ToListAsync(cancellationToken);
    }

    public async Task<int> CountReservedAsync(UserId ownerId, CancellationToken cancellationToken = default)
        => await Set.CountAsync(a => a.OwnerId == ownerId
                                     && (a.Status == MediaAssetStatus.Uploading || a.Status == MediaAssetStatus.Pending), cancellationToken);

    public async Task<IReadOnlyList<MediaAsset>> GetSweepBatchAsync(MediaSweepWindow window, int batch, CancellationToken cancellationToken = default)
    {
        var rows = await Set
            .Where(a => (a.Status == MediaAssetStatus.Uploading && a.StatusChangedAt < window.UploadingBefore)
                        || (a.Status == MediaAssetStatus.Pending && a.StatusChangedAt < window.PendingBefore)
                        || (a.Status == MediaAssetStatus.Released && a.StatusChangedAt < window.ReleasedBefore)
                        || (a.Status == MediaAssetStatus.Deleting && a.StatusChangedAt < window.DeletingBefore))
            .ToListAsync(cancellationToken);

        // Ordered in memory: SQLite cannot order DateTimeOffset-like columns & the batch is small
        return rows.OrderBy(a => a.StatusChangedAt).Take(batch).ToList();
    }

    public async Task<MediaAsset?> GetAttachedAvatarAsync(UserId ownerId, string url, CancellationToken cancellationToken = default)
        => await Set.FirstOrDefaultAsync(a => a.OwnerId == ownerId
                                              && a.Purpose == MediaPurpose.Avatar
                                              && a.Status == MediaAssetStatus.Attached
                                              && a.Url == url, cancellationToken);

    public async Task<bool> BumpQuotaTokenAsync(UserId ownerId, CancellationToken cancellationToken = default)
    {
        var user = await Db.Users.FindAsync([ownerId], cancellationToken);
        if (user is null) return false;

        var token = Db.Entry(user).Property<int>(YSocialDbContext.MediaQuotaVersion);
        token.CurrentValue += 1;
        token.IsModified = true;
        return true;
    }
}
