using MediatR;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;

namespace YSocial.Application.CQRS.Behaviors.UnitOfWork;

public sealed class TransactionBehavior<TRequest, TResponse>(IUnitOfWork unitOfWork) : IPipelineBehavior<TRequest, TResponse>
    where TRequest : ICommand<TResponse>
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        var response = await next(cancellationToken);

        await unitOfWork.CommitAsync(cancellationToken);

        return response;
    }
}
