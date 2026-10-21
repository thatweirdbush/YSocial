using Microsoft.Extensions.Diagnostics.HealthChecks;
using YSocial.Application.Abstractions.Media;

namespace YSocial.Infrastructure.Media;

/// <summary>
/// Healthy when media storage is configured, Degraded when the stand-in is active (HTTP 200: the app still serves everything except media).
/// Never calls the provider: a probe costs nothing and cannot fail because of an outage.
/// </summary>
public sealed class MediaStorageHealthCheck(IMediaStorage storage) : IHealthCheck
{
    public const string Name = "media-storage";

    public Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        => Task.FromResult(storage.IsAvailable
            ? HealthCheckResult.Healthy("Media storage is configured.")
            : HealthCheckResult.Degraded("Media storage is not configured."));
}
