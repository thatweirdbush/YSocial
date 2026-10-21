using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using NSubstitute;
using Xunit;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Posts;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Repositories;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Application.UnitTests.Persistence;

/// <summary>
/// Runs a test only when <c>YSOCIAL_TEST_POSTGRES</c> holds an ADMIN connection string of a disposable PostgreSQL server
/// (rights to CREATE/DROP DATABASE). Never point it at a shared dev database: every test creates and drops its own database.
/// </summary>
public sealed class PostgresFactAttribute : FactAttribute
{
    public const string EnvironmentVariable = "YSOCIAL_TEST_POSTGRES";

    public PostgresFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable(EnvironmentVariable)))
        {
            Skip = $"Set {EnvironmentVariable} to run the PostgreSQL provider tests";
        }
    }
}

/// <summary>
/// Provider-specific checks SQLite cannot give: migration SQL, owned/child rows & queries of discovery on Npgsql.
/// </summary>
public sealed class PostgresTests
{
    internal sealed class TempDatabase : IAsyncDisposable
    {
        private readonly string _admin = Environment.GetEnvironmentVariable(PostgresFactAttribute.EnvironmentVariable)!;
        private readonly string _name = $"ysocial_test_{Guid.NewGuid():N}";

        public DbContextOptions<YSocialDbContext> Options { get; private set; } = null!;

        public static async Task<TempDatabase> CreateAsync()
        {
            var database = new TempDatabase();
            await database.ExecuteAdminAsync($"CREATE DATABASE \"{database._name}\"");

            var connection = new NpgsqlConnectionStringBuilder(database._admin) { Database = database._name }.ConnectionString;
            database.Options = new DbContextOptionsBuilder<YSocialDbContext>()
                .UseNpgsql(connection, npgsql => npgsql.UseQuerySplittingBehavior(QuerySplittingBehavior.SplitQuery))
                .Options;
            return database;
        }

        public YSocialDbContext NewContext() => new(Options);

        public async ValueTask DisposeAsync()
        {
            NpgsqlConnection.ClearAllPools();
            await ExecuteAdminAsync($"DROP DATABASE IF EXISTS \"{_name}\" WITH (FORCE)");
        }

        private async Task ExecuteAdminAsync(string sql)
        {
            await using var connection = new NpgsqlConnection(_admin);
            await connection.OpenAsync();
            await using var command = new NpgsqlCommand(sql, connection);
            await command.ExecuteNonQueryAsync();
        }
    }

    private sealed class Unit(YSocialDbContext db) : IDisposable
    {
        private readonly UnitOfWork _unitOfWork = new(db, Substitute.For<IDomainEventsDispatcher>());

        public PostRepository Posts => new(db, _unitOfWork);

        public Task CommitAsync() => _unitOfWork.CommitAsync();

        public void Dispose() => db.Dispose();
    }

    [PostgresFact]
    public async Task Migrations_ApplyToAnEmptyDatabase_AndTheModelHasNoPendingChanges()
    {
        await using var database = await TempDatabase.CreateAsync();
        using var db = database.NewContext();

        await db.Database.MigrateAsync();

        (await db.Database.GetPendingMigrationsAsync()).Should().BeEmpty();
        db.Database.HasPendingModelChanges().Should().BeFalse("a model change needs its migration");
    }

    [PostgresFact]
    public async Task Hashtags_RoundTrip_EditDiff_AndDiscoveryQueries_WorkOnNpgsql()
    {
        await using var database = await TempDatabase.CreateAsync();
        using (var setup = database.NewContext())
        {
            await setup.Database.MigrateAsync();
            await CoreSeeder.SeedAsync(setup);
        }

        var author = SeedIds.TestUser;
        var post = Post.Create(author, "Morning #Coffee #code");
        using (var unit = new Unit(database.NewContext()))
        {
            await unit.Posts.AddAsync(post);
            await unit.CommitAsync();
        }

        using (var unit = new Unit(database.NewContext()))
        {
            var loaded = (await unit.Posts.GetByIdWithHashtagsAsync(post.Id))!;
            loaded.UpdateContent(author, "#coffee #added");
            await unit.CommitAsync();
        }

        using var read = new Unit(database.NewContext());
        var byKey = await read.Posts.GetByHashtagKeyAsync("coffee");
        var since = await read.Posts.GetWithHashtagsSinceAsync(DateTime.UtcNow.AddDays(-1));

        byKey.Should().ContainSingle().Which.Hashtags.Select(h => h.Key).Should().BeEquivalentTo("coffee", "added");
        since.Should().ContainSingle(p => p.Id == post.Id);
        (await read.Posts.GetByHashtagKeyAsync("code")).Should().BeEmpty("the edit dropped #code");
    }

    [PostgresFact]
    public async Task DevelopmentSeed_RunsTwiceOnNpgsql_AndFeedsTrending()
    {
        await using var database = await TempDatabase.CreateAsync();
        using (var db = database.NewContext())
        {
            await db.Database.MigrateAsync();
            await CoreSeeder.SeedAsync(db);
            await DevelopmentSeeder.SeedAsync(db);
        }

        using var again = database.NewContext();
        var posts = await again.Posts.CountAsync();
        await DevelopmentSeeder.SeedAsync(again);

        (await again.Posts.CountAsync()).Should().Be(posts, "seeding twice must not duplicate anything");
        var tagged = await new PostRepository(again, Substitute.For<Microservice.BuildingBlocks.Domain.UnitOfWorks.IUnitOfWork>())
            .GetWithHashtagsSinceAsync(DateTime.UtcNow.AddDays(-30));
        tagged.SelectMany(p => p.Hashtags).Select(h => h.Key).Should().Contain(["saigon", "dalat"]);
    }
}
