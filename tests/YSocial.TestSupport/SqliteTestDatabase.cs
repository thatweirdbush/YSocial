using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Seeding;

namespace YSocial.TestSupport;

/// <summary>
/// Throw-away SQLite file database with the production model (never touches the real Postgres).
/// File based so concurrent requests get their own connection, like Postgres: WAL + busy timeout.
/// </summary>
public sealed class SqliteTestDatabase : IDisposable
{
    private readonly string _path = Path.Combine(Path.GetTempPath(), $"ysocial-tests-{Guid.NewGuid():N}.db");

    private readonly DbContextOptions<YSocialDbContext> _options;

    public SqliteTestDatabase()
    {
        ConnectionString = $"Data Source={_path};Default Timeout=30";
        _options = new DbContextOptionsBuilder<YSocialDbContext>().UseSqlite(ConnectionString, sqlite => sqlite.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery)).Options;

        using var db = NewContext();
        db.Database.EnsureCreated();
        db.Database.ExecuteSqlRaw("PRAGMA journal_mode=WAL;");
        CoreSeeder.SeedAsync(db).GetAwaiter().GetResult();
    }

    public string ConnectionString { get; }

    /// <summary>
    /// Independent context (own connection & change tracker).
    /// </summary>
    public YSocialDbContext NewContext() => new(_options);

    /// <summary>
    /// Replaces the app's database registration by this SQLite database (call from the host's service configuration).
    /// </summary>
    public void ReplaceDatabaseOf(IServiceCollection services)
    {
        services.RemoveAll<DbContextOptions<YSocialDbContext>>();
        services.RemoveAll<DbContextOptions>();
        services.RemoveAll<IDbContextOptionsConfiguration<YSocialDbContext>>();
        services.RemoveAll<YSocialDbContext>();

        services.AddDbContext<YSocialDbContext>(options => options.UseSqlite(ConnectionString, sqlite => sqlite.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery)));
    }

    /// <summary>
    /// Empties every table & seeds the core baseline again (identical start for every test).
    /// </summary>
    public void Reset()
    {
        using var db = NewContext();

        var tables = db.Model.GetEntityTypes()
            .Select(e => e.GetTableName())
            .Where(name => name is not null)
            .Distinct()
            .OrderBy(name => name is "RefreshTokens" or "PasswordResetTokens" ? 0 : 1)
            .ToList();

        foreach (var table in tables)
        {
#pragma warning disable EF1002 // table names come from the EF model, not from input
            db.Database.ExecuteSqlRaw($"DELETE FROM \"{table}\"");
#pragma warning restore EF1002
        }

        CoreSeeder.SeedAsync(db).GetAwaiter().GetResult();
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();

        foreach (var file in new[] { _path, _path + "-wal", _path + "-shm" })
        {
            try { File.Delete(file); } catch (IOException) { /* best effort */ }
        }
    }
}
