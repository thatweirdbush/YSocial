using MediatR;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
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

/// <summary>
/// Which media storage the test host runs on.
/// </summary>
public enum StorageMode
{
    /// <summary>In-memory fake with fault injection (every normal test).</summary>
    Fake,

    /// <summary>Production selection with the Cloudinary keys forced EMPTY: the stand-in that answers 503.</summary>
    Unavailable,

    /// <summary>Production selection with the REAL keys of user-secrets: ONLY the opt-in manual smoke.</summary>
    Real
}

/// <param name="storage">The real keys of the developer machine must never be reachable from normal tests: only
/// <see cref="StorageMode.Real"/> (opt-in smoke) leaves the configuration untouched.</param>
public class ApiFactory(SqliteTestDatabase database, StorageMode storage = StorageMode.Fake) : WebApplicationFactory<Program>
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

        if (storage == StorageMode.Unavailable)
        {
            // Added after user-secrets & env vars, so it wins over them
            builder.ConfigureAppConfiguration((_, configuration) => configuration.AddInMemoryCollection(new Dictionary<string, string?>
            {
                ["Cloudinary:CloudName"] = "",
                ["Cloudinary:ApiKey"] = "",
                ["Cloudinary:ApiSecret"] = ""
            }));
        }

        // appsettings.Development.json opts into raw OTP logging for manual dev: redaction tests need it off
        builder.UseSetting("Messaging:LogOtpInDevelopment", "false");

        // The test database is created & seeded by SqliteTestDatabase: no migrations (Npgsql only), no dev dataset
        builder.UseSetting("Database:AutoMigrate", "false");
        builder.UseSetting("Database:SeedData", "false");

        builder.ConfigureServices(services =>
        {
            // Never the real (Postgres) database
            database.ReplaceDatabaseOf(services);

            if (storage == StorageMode.Fake)
            {
                services.RemoveAll<IMediaStorage>();
                services.AddSingleton<IMediaStorage>(Storage);
            }

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
