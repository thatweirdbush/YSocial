using MediatR;
using Microservice.BuildingBlocks.CQRS.Extensions;
using Microsoft.Extensions.Logging;

namespace YSocial.Application.CQRS.Behaviors.Logging;

public class LoggingBehavior<TRequest, TResponse>(ILogger<LoggingBehavior<TRequest, TResponse>> logger) : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        logger.LogInformation("Handling command {CommandName} ({@Command})", request.GetGenericTypeName(), request);

        var response = await next(cancellationToken);

        logger.LogInformation("Command {CommandName} handled - response: {@Response}", request.GetGenericTypeName(), response);

        return response;
    }
}
