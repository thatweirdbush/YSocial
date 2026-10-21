using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Media;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Media.DiscardMedia;

/// <summary>
/// Discards one OWN <c>Pending</c> asset. Everything else (foreign, unknown, attached, released, deleting) answers the same 404.
/// </summary>
public sealed record DiscardMediaCommand(Guid Id) : ResultCommand;

internal sealed class DiscardMediaCommandHandler(
    IMediaAssetRepository assets,
    IUnitOfWork unitOfWork,
    IMediaStorage storage,
    IUserContext userContext,
    TimeProvider time,
    ILogger<DiscardMediaCommandHandler> logger)
    : ICommandHandler<DiscardMediaCommand, Result>
{
    private const string NotFoundMessage = "Resource not found.";

    public async Task<Result> Handle(DiscardMediaCommand command, CancellationToken cancellationToken)
    {
        if (!userContext.IsAuthenticated)
        {
            return Result.Unauthorized();
        }

        // Nothing is touched while the provider cannot be used
        if (!storage.IsAvailable)
        {
            throw new MediaStorageUnavailableException("Media storage is not configured.");
        }

        var asset = (await assets.GetByIdsAsync([new MediaAssetId(command.Id)], cancellationToken)).FirstOrDefault();
        if (asset is null)
        {
            return Result.NotFound(NotFoundMessage);
        }

        // Foreign or not pending: the rule answers the same 404
        asset.Discard(new UserId(userContext.UserId), time.GetUtcNow().UtcDateTime);

        try
        {
            // The claim is saved BEFORE the remote delete: whoever loses the race (attach, sweep) never sees a half state
            await unitOfWork.CommitAsync(cancellationToken);
        }
        catch (ConcurrencyConflictException)
        {
            return Result.NotFound(NotFoundMessage);
        }

        try
        {
            await storage.DeleteAsync([new StoredMediaRef(asset.PublicId, asset.Kind)], cancellationToken);

            assets.Remove(asset);
            await unitOfWork.CommitAsync(cancellationToken);
        }
        catch (Exception exception) when (!cancellationToken.IsCancellationRequested)
        {
            // The asset is already unusable (Deleting); the sweep retries the remote delete
            logger.LogWarning("Discarded media asset stays Deleting ({ExceptionType}); the sweep will finish it", exception.GetType().Name);
        }

        return Result.Success();
    }
}
