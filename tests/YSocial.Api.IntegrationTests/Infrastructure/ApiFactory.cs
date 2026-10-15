using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using YSocial.Infrastructure.Notifications.Outbox;

namespace YSocial.Api.IntegrationTests.Infrastructure;

public class ApiFactory : WebApplicationFactory<Program>
{
    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
        {
            // Background polling job mutates shared state: outbox tests process messages directly
            var job = services.Where(d => d.ImplementationType == typeof(ProcessNotificationOutboxJob)
                                          && d.ServiceType == typeof(IHostedService)).ToList();
            foreach (var descriptor in job)
            {
                services.Remove(descriptor);
            }

            // Test-only probe endpoints
            services.AddControllers().AddApplicationPart(typeof(TestProbeController).Assembly);
        });
    }

    public HttpClient CreateApiClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        AllowAutoRedirect = false
    });
}
