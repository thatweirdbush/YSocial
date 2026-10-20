using MediatR;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using YSocial.Application.CQRS.Results;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Infrastructure;

public class ApiFactory(SqliteTestDatabase database) : WebApplicationFactory<Program>
{
    /// <summary>
    /// Every log message of the host (redaction tests).
    /// </summary>
    public CapturingLoggerProvider Logs { get; } = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.ConfigureLogging(logging => logging.AddProvider(Logs));

        // appsettings.Development.json opts into raw OTP logging for manual dev: redaction tests need it off
        builder.UseSetting("Messaging:LogOtpInDevelopment", "false");

        // The test database is created & seeded by SqliteTestDatabase: no migrations (Npgsql only), no dev dataset
        builder.UseSetting("Database:AutoMigrate", "false");
        builder.UseSetting("Database:SeedData", "false");

        builder.ConfigureServices(services =>
        {
            // Never the real (Postgres) database
            database.ReplaceDatabaseOf(services);

            // Background polling job mutates shared state: outbox tests process messages directly
            var job = services.Where(d => d.ImplementationType == typeof(ProcessNotificationOutboxJob)
                                          && d.ServiceType == typeof(IHostedService)).ToList();
            foreach (var descriptor in job)
            {
                services.Remove(descriptor);
            }

            // Test-only probe endpoints
            services.AddControllers().AddApplicationPart(typeof(TestProbeController).Assembly);
            services.AddTransient<IRequestHandler<FailAfterEventCommand, Result>, FailAfterEventHandler>();
        });
    }

    public HttpClient CreateApiClient() => CreateClient(new WebApplicationFactoryClientOptions
    {
        BaseAddress = new Uri("https://localhost"),
        AllowAutoRedirect = false
    });
}
