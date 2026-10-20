using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace YSocial.Infrastructure.Persistence.Seeding;

/// <summary>
/// What <see cref="DatabaseInitializer"/> does at startup (bound from the <c>Database</c> config section).
/// </summary>
/// <param name="Migrate">Apply pending EF migrations.</param>
/// <param name="SeedData">Seed core + development dataset (well-known passwords: Development only).</param>
public sealed record DatabaseInitOptions(bool Migrate, bool SeedData);

/// <summary>
/// Startup database preparation: migrate, then seed (both idempotent).
/// </summary>
public static class DatabaseInitializer
{
    public static async Task InitializeAsync(IServiceProvider services, DatabaseInitOptions options, CancellationToken cancellationToken = default)
    {
        await using var scope = services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<YSocialDbContext>();
        var logger = scope.ServiceProvider.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DatabaseInitializer));

        if (options.Migrate)
        {
            logger.LogInformation("Applying database migrations");
            await db.Database.MigrateAsync(cancellationToken);
        }

        if (options.SeedData)
        {
            logger.LogInformation("Seeding database (core + development dataset)");
            await CoreSeeder.SeedAsync(db, cancellationToken);
            await DevelopmentSeeder.SeedAsync(db, cancellationToken);
        }
    }
}
