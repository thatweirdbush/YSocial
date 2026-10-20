using FluentAssertions;
using Npgsql;
using Xunit;
using YSocial.Infrastructure.Persistence;

namespace YSocial.Application.UnitTests.Persistence;

public class ConnectionStringsTests
{
    [Fact]
    public void Normalize_PostgresUri_BecomesNpgsqlConnectionString()
    {
        var normalized = ConnectionStrings.Normalize("postgres://app_user:p%40ss:word@db.example.com:18664/appdb?sslmode=require");

        var builder = new NpgsqlConnectionStringBuilder(normalized);
        builder.Host.Should().Be("db.example.com");
        builder.Port.Should().Be(18664);
        builder.Database.Should().Be("appdb");
        builder.Username.Should().Be("app_user");
        builder.Password.Should().Be("p@ss:word");
        builder.SslMode.Should().Be(SslMode.Require);
    }

    [Fact]
    public void Normalize_UriWithoutPort_UsesDefault5432()
    {
        var builder = new NpgsqlConnectionStringBuilder(ConnectionStrings.Normalize("postgresql://u:p@localhost/db"));

        builder.Port.Should().Be(5432);
        builder.Host.Should().Be("localhost");
    }

    [Fact]
    public void Normalize_KeyValueString_PassesThrough()
    {
        const string connection = "Host=localhost;Database=ysocial;Username=u;Password=p";

        ConnectionStrings.Normalize(connection).Should().Be(connection);
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Normalize_Missing_Throws(string? connection)
    {
        var act = () => ConnectionStrings.Normalize(connection);

        act.Should().Throw<InvalidOperationException>().WithMessage("*DefaultConnection*");
    }
}
