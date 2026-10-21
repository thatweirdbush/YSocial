using FluentAssertions;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Xunit;
using YSocial.Infrastructure.Media;
using YSocial.TestSupport;

namespace YSocial.Application.UnitTests.Media;

public class MediaStorageHealthCheckTests
{
    [Fact]
    public async Task ConfiguredStorage_IsHealthy()
    {
        var result = await new MediaStorageHealthCheck(new FakeMediaStorage()).CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Healthy);
    }

    [Fact]
    public async Task UnavailableStorage_IsDegraded_NotUnhealthy()
    {
        var result = await new MediaStorageHealthCheck(new UnavailableMediaStorage()).CheckHealthAsync(new HealthCheckContext());

        result.Status.Should().Be(HealthStatus.Degraded);
        result.Description.Should().Contain("not configured");
    }

    [Fact]
    public async Task Probe_NeverCallsTheProvider()
    {
        var storage = new FakeMediaStorage();

        await new MediaStorageHealthCheck(storage).CheckHealthAsync(new HealthCheckContext());

        storage.UploadAttempts.Should().Be(0);
        storage.DeleteRequests.Should().BeEmpty();
    }
}
