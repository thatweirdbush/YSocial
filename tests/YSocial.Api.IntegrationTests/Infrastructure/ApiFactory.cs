using MediatR;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using YSocial.Application.Abstractions.Media;
using YSocial.Application.CQRS.Results;
using YSocial.Infrastructure.Media;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.TestSupport;

namespace YSocial.Api.IntegrationTests.Infrastructure;

public class ApiFactory(SqliteTestDatabase database) : WebApplicationFactory<Program>
{
    /// <summary>
    /// Every log message of the host (redaction tests).
    /// </summary>
    public CapturingLoggerProvider Logs { get; } = new();

    /// <summary>
    /// The media storage of the host (never the real Cloudinary): files, faults and calls are inspectable.
    /// </summary>
    public FakeMediaStorage Storage { get; } = new();

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

            services.RemoveAll<IMediaStorage>();
            services.AddSingleton<IMediaStorage>(Storage);

            // Background polling job mutates shared state: outbox tests process messages directly
            var job = services.Where(d => d.ImplementationType == typeof(ProcessNotificationOutboxJob)
                                          && d.ServiceType == typeof(IHostedService)).ToList();
            foreach (var descriptor in job)
            {
                services.Remove(descriptor);
            }

            // The sweep is run by tests explicitly (it would delete rows under test)
            foreach (var descriptor in services.Where(d => d.ImplementationType == typeof(MediaCleanupJob)
                                                           && d.ServiceType == typeof(IHostedService)).ToList())
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
