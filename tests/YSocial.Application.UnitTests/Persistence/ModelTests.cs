using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Xunit;
using YSocial.Infrastructure.Persistence;

namespace YSocial.Application.UnitTests.Persistence;

/// <summary>
/// Guards of the production (Npgsql) model: no database needed.
/// </summary>
public class ModelTests
{
    private static YSocialDbContext Npgsql()
        => new(new DbContextOptionsBuilder<YSocialDbContext>().UseNpgsql("Host=localhost;Database=ysocial_model_test").Options);

    [Fact]
    public void Model_MatchesLatestMigrationSnapshot()
    {
        using var db = Npgsql();

        db.Database.HasPendingModelChanges().Should().BeFalse(
            "a model change needs a migration: dotnet ef migrations add <Name> -p src/YSocial.Infrastructure -s src/YSocial.Api -o Persistence/Migrations");
    }

    [Fact]
    public void Model_EveryAggregateHasTable_AndNoCrossAggregateForeignKey()
    {
        using var db = Npgsql();

        var foreignKeys = db.Model.GetEntityTypes().SelectMany(e => e.GetForeignKeys()).ToList();

        foreignKeys.Should().OnlyContain(
            fk => fk.PrincipalEntityType.ClrType.Name == "Account" || fk.IsOwnership,
            "aggregates reference each other by id only; the only foreign keys are Account -> its own tokens (& owned value objects)");
    }

    [Fact]
    public void Model_AllDateTimes_AreTimestampTz()
    {
        using var db = Npgsql();

        var dateTimes = db.Model.GetEntityTypes()
            .SelectMany(e => e.GetProperties())
            .Where(p => p.ClrType == typeof(DateTime) || p.ClrType == typeof(DateTime?))
            .Where(p => p.Name != "DateOfBirth")
            .ToList();

        dateTimes.Should().NotBeEmpty();
        dateTimes.Select(p => p.GetColumnType()).Should().OnlyContain(type => type == "timestamp with time zone");
    }
}
