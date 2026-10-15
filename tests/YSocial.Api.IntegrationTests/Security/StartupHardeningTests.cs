using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using System.Net;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;

namespace YSocial.Api.IntegrationTests.Security;

/// <summary>
/// Startup in a non-Development environment (BG s10.8, s10.13). Own factories, no shared fixture state besides the static store.
/// </summary>
[Collection(ApiCollection.Name)]
public class StartupHardeningTests
{
    private const string ValidSecret = "production-test-secret-0123456789-abcdefghij";

    private static WebApplicationFactory<Program> Production(string? secret)
        => new ApiFactory().WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            if (secret is not null)
            {
                builder.UseSetting("Jwt:SecretKey", secret);
            }
        });

    [Fact]
    public void Production_MissingJwtSecret_FailsStartup()
    {
        using var factory = Production(secret: null);

        var act = () => factory.CreateClient();

        act.Should().Throw<Exception>().Which.ToString().Should().Contain("Jwt:SecretKey");
    }

    [Fact]
    public void Production_ShortJwtSecret_FailsStartup()
    {
        using var factory = Production(secret: "too-short");

        var act = () => factory.CreateClient();

        act.Should().Throw<Exception>().Which.ToString().Should().Contain("Jwt:SecretKey");
    }

    [Fact]
    public async Task Production_ConfiguredSecret_Starts_WithoutDevelopmentArtifacts()
    {
        var factory = new ApiFactory();
        using var production = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Production");
            builder.UseSetting("Jwt:SecretKey", ValidSecret);
        });
        using var client = production.CreateClient(new WebApplicationFactoryClientOptions { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });

        var swagger = await client.GetAsync("/swagger/v1/swagger.json");
        var swaggerJs = await client.GetAsync("/swagger-custom.js");

        swagger.StatusCode.Should().Be(HttpStatusCode.NotFound);
        swaggerJs.StatusCode.Should().Be(HttpStatusCode.NotFound, "the admin-token script is Development only");
        factory.Logs.Entries.Should().NotContain(e => e.Message.Contains("DEVELOPMENT ADMIN TOKEN"));
    }
}
