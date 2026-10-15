using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;

namespace YSocial.Api.IntegrationTests.Posts;

public class CreatePostTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private async Task<HttpResponseMessage> CreateAsync(object body)
    {
        var test = await LoginAsync(Seed.TestLogin);
        return await test.PostAsJsonAsync("/api/posts", body);
    }

    private static async Task AssertFieldErrorAsync(HttpResponseMessage response, string field)
    {
        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        doc.RootElement.GetProperty("code").GetString().Should().Be("ValidationFailed");
        doc.RootElement.GetProperty("errors").TryGetProperty(field, out _).Should().BeTrue($"errors must name '{field}'");
    }

    [Fact]
    public async Task CreatePost_TextOnly_Returns2xx()
    {
        var response = await CreateAsync(new { content = "text only" });

        response.IsSuccessStatusCode.Should().BeTrue();
    }

    [Fact]
    public async Task CreatePost_TextOnlyNullImage_Returns2xx()
    {
        var response = await CreateAsync(new { content = "text only", imageUrl = (string?)null });

        response.IsSuccessStatusCode.Should().BeTrue();
    }

    [Fact]
    public async Task CreatePost_EmptyContent_Returns400_ValidationFailed()
        => await AssertFieldErrorAsync(await CreateAsync(new { content = "" }), "content");

    [Fact]
    public async Task CreatePost_ContentOver2000_Returns400()
        => await AssertFieldErrorAsync(await CreateAsync(new { content = new string('a', 2001) }), "content");

    [Theory]
    [InlineData("not a url")]
    [InlineData("ftp://files.test/a.png")]
    [InlineData("/relative/a.png")]
    public async Task CreatePost_InvalidImageUrl_Returns400(string imageUrl)
        => await AssertFieldErrorAsync(await CreateAsync(new { content = "x", imageUrl }), "imageUrl");

    [Fact]
    public async Task CreatePost_ImageUrlOver2048_Returns400()
        => await AssertFieldErrorAsync(await CreateAsync(new { content = "x", imageUrl = "https://img.test/" + new string('a', 2040) }), "imageUrl");

    [Fact]
    public async Task CreatePost_WithImage_Returns2xx()
    {
        var response = await CreateAsync(new { content = "with image", imageUrl = "https://img.test/a.png" });

        response.IsSuccessStatusCode.Should().BeTrue();
    }
}
