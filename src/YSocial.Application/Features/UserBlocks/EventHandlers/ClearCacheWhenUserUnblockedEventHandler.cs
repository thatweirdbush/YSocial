using MediatR;
using YSocial.Domain.UserBlocks.Events;

namespace YSocial.Application.Features.UserBlocks.EventHandlers;

internal sealed class ClearCacheWhenUserUnblockedEventHandler(
    /*ICacheService cacheService,
    ISearchIndexer searchIndexer*/) : INotificationHandler<UserUnblockedEvent>
{
    public async Task Handle(UserUnblockedEvent notification, CancellationToken cancellationToken)
    {
        //// 1. Clear cache so that subsequent IsBlocked checks return false immediately.
        //var cacheKey = $"blocks:{notification.ObserverId}:{notification.TargetId}";
        //await cacheService.RemoveAsync(cacheKey, cancellationToken);

        //// 2. Update Search Index (if any) so that the two users can find each other
        //await Task.WhenAll(
        //    searchIndexer.ReindexUserAsync(notification.ObserverId, cancellationToken),
        //    searchIndexer.ReindexUserAsync(notification.TargetId, cancellationToken)
        //);
    }
}
