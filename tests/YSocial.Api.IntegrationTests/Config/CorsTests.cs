using FluentAssertions;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;

namespace YSocial.Api.IntegrationTests.Config;

public class CorsTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private async Task<HttpResponseMessage> PreflightAsync(string origin)
    {
        var request = new HttpRequestMessage(HttpMethod.Options, "/api/identities/login");
        request.Headers.Add("Origin", origin);
        request.Headers.Add("Access-Control-Request-Method", "POST");
        request.Headers.Add("Access-Control-Request-Headers", "content-type,authorization");
        return await Client.SendAsync(request);
    }

    [Fact]
    public async Task Cors_AllowedOrigin_GetsHeaders()
    {
        var response = await PreflightAsync("http://localhost:3000");

        response.Headers.GetValues("Access-Control-Allow-Origin").Should().Equal("http://localhost:3000");
        response.Headers.GetValues("Access-Control-Allow-Credentials").Should().Equal("true");
    }

    [Fact]
    public async Task Cors_UnknownOrigin_NoAllowOrigin()
    {
        var response = await PreflightAsync("http://evil.test");

        response.Headers.Contains("Access-Control-Allow-Origin").Should().BeFalse();
    }
}
