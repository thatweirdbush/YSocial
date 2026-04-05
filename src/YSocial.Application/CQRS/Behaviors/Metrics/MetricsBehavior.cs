using MediatR;
using Microsoft.Extensions.Logging;
using System.Diagnostics;

namespace YSocial.Application.CQRS.Behaviors.Metrics;

public sealed class MetricsBehavior<TRequest, TResponse>(ILogger<MetricsBehavior<TRequest, TResponse>> logger) : IPipelineBehavior<TRequest, TResponse>
    where TRequest : notnull
{
    public async Task<TResponse> Handle(TRequest request, RequestHandlerDelegate<TResponse> next, CancellationToken cancellationToken)
    {
        var stopwatch = Stopwatch.StartNew();

        var result = await next(cancellationToken);

        stopwatch.Stop();

        logger.LogInformation($"Finished in {stopwatch.ElapsedMilliseconds}ms");

        return result;
    }
}
