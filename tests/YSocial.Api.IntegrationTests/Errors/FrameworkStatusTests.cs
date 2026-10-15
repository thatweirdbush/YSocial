using FluentAssertions;
using System.Net;
using System.Text;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;

namespace YSocial.Api.IntegrationTests.Errors;

/// <summary>
/// Framework-generated 405 / 415 use the same envelope with their own codes (BG s10.18).
/// </summary>
public class FrameworkStatusTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task WrongMethod_Returns405_MethodNotAllowed()
    {
        var response = await Client.PutAsync("/api/feed", null);

        response.StatusCode.Should().Be(HttpStatusCode.MethodNotAllowed);
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        var body = await response.ReadJsonAsync();
        body.GetProperty("code").GetString().Should().Be("MethodNotAllowed");
        body.GetProperty("status").GetInt32().Should().Be(405);
        body.GetProperty("title").GetString().Should().Be("Method Not Allowed");
    }

    [Fact]
    public async Task WrongContentType_Returns415_UnsupportedMediaType()
    {
        var content = new StringContent($"{{\"loginId\":\"{Seed.TestLogin}\"}}", Encoding.UTF8, "text/plain");

        var response = await Client.PostAsync("/api/identities/login", content);

        response.StatusCode.Should().Be(HttpStatusCode.UnsupportedMediaType);
        var body = await response.ReadJsonAsync();
        body.GetProperty("code").GetString().Should().Be("UnsupportedMediaType");
        body.GetProperty("title").GetString().Should().Be("Unsupported Media Type");
    }
}
