using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace YSocial.Infrastructure.Persistence;

/// <summary>
/// Design-time only (<c>dotnet ef migrations ...</c>): builds the context without booting the API.
/// Scaffolding needs no live database; <c>YSOCIAL_DESIGN_CONNECTION</c> overrides the placeholder for <c>database update</c>.
/// </summary>
public sealed class YSocialDbContextFactory : IDesignTimeDbContextFactory<YSocialDbContext>
{
    private const string Placeholder = "Host=localhost;Database=ysocial_design;Username=postgres;Password=postgres";

    public YSocialDbContext CreateDbContext(string[] args)
    {
        var connection = ConnectionStrings.Normalize(Environment.GetEnvironmentVariable("YSOCIAL_DESIGN_CONNECTION") ?? Placeholder);

        var options = new DbContextOptionsBuilder<YSocialDbContext>()
            .UseNpgsql(connection)
            .Options;

        return new YSocialDbContext(options);
    }
}
