using MediatR;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Application.CQRS.Results;

namespace YSocial.Application.CQRS.Behaviors.UnitOfWork;

/// <summary>
/// Commits only successful commands. Failed requests drop their pending events (no leak into later requests).
/// In-memory mutations are NOT rolled back.
/// </summary>
public sealed class TransactionBehavior<TRequest, TResponse>(
    IUnitOfWork unitOfWork,
    IPendingDomainEvents pendingEvents,
    ILogger<TransactionBehavior<TRequest, TResponse>> logger) : IPipelineBehavior<TRequest, TResponse>
    where TRequest : ICommand<TResponse>
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        TResponse response;

        try
        {
            response = await next(cancellationToken);
        }
        catch
        {
            DiscardPending(request, "handler exception");
            throw;
        }

        if (response is Result { IsSuccess: false })
        {
            DiscardPending(request, "failed result");
            return response;
        }

        await unitOfWork.CommitAsync(cancellationToken);

        return response;
    }

    private void DiscardPending(TRequest request, string reason)
    {
        var discarded = pendingEvents.Discard();

        if (discarded.Count > 0)
        {
            logger.LogWarning("Discarded {Count} pending events of {Request} ({Reason}): {EventTypes}",
                discarded.Count, typeof(TRequest).Name, reason, string.Join(", ", discarded.Select(e => e.GetType().Name)));
        }
    }
}
