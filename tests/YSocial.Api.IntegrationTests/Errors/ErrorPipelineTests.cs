using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Infrastructure.Persistence.Seeding;

namespace YSocial.Api.IntegrationTests.Errors;

public class ErrorPipelineTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static async Task<JsonElement> ProblemAsync(HttpResponseMessage response)
    {
        response.Content.Headers.ContentType!.MediaType.Should().Be("application/problem+json");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static void AssertProblem(JsonElement body, int status, string code)
    {
        body.GetProperty("status").GetInt32().Should().Be(status);
        body.GetProperty("code").GetString().Should().Be(code);
        body.GetProperty("title").GetString().Should().NotBeNullOrEmpty();
    }

    [Theory]
    [InlineData("validation", 400, "ValidationFailed")]
    [InlineData("business", 400, "BusinessRuleViolated")]
    [InlineData("unauthorized", 401, "Unauthenticated")]
    [InlineData("forbidden", 403, "Forbidden")]
    [InlineData("notfound", 404, "NotFound")]
    [InlineData("conflict", 409, "Conflict")]
    [InlineData("none", 500, "InternalError")]
    public async Task Result_MapsToStatusAndDefaultCode(string type, int status, string code)
    {
        var response = await Client.GetAsync($"/api/testprobe/result/{type}");

        response.StatusCode.Should().Be((HttpStatusCode)status);
        AssertProblem(await ProblemAsync(response), status, code);
    }

    [Fact]
    public async Task ResultConflict_DuplicateEmail_Returns409()
    {
        var response = await Client.PostAsJsonAsync("/api/identities/register", new { email = Seed.TestLogin, password = "Password123!", username = "someone_else" });

        response.StatusCode.Should().Be(HttpStatusCode.Conflict);
        AssertProblem(await ProblemAsync(response), 409, "EmailTaken");
    }

    [Fact]
    public async Task ValidatorFailure_Returns400_WithErrorsCamelCase()
    {
        var response = await Client.PostAsJsonAsync("/api/identities/register", new { email = "not-an-email", password = "x", username = "ok_name" });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await ProblemAsync(response);
        AssertProblem(body, 400, "ValidationFailed");
        var errors = body.GetProperty("errors");
        errors.TryGetProperty("email", out var email).Should().BeTrue();
        email.GetArrayLength().Should().BeGreaterThan(0);
        errors.TryGetProperty("password", out _).Should().BeTrue();
    }

    [Fact]
    public async Task ThrownFluentValidation_Returns400_WithErrors()
    {
        var response = await Client.GetAsync("/api/testprobe/throw/validation");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await ProblemAsync(response);
        AssertProblem(body, 400, "ValidationFailed");
        body.GetProperty("errors").GetProperty("displayName")[0].GetString().Should().Be("must not be empty");
    }

    [Theory]
    [InlineData("rule")]
    [InlineData("rulestring")]
    public async Task UnclassifiedRule_Returns400_BusinessRuleViolated(string kind)
    {
        var response = await Client.GetAsync($"/api/testprobe/throw/{kind}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        AssertProblem(await ProblemAsync(response), 400, "BusinessRuleViolated");
    }

    [Fact]
    public async Task MalformedJson_Returns400_ValidationFailed()
    {
        var content = new StringContent("{ not json", Encoding.UTF8, "application/json");

        var response = await Client.PostAsync("/api/testprobe/echo", content);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        var body = await ProblemAsync(response);
        AssertProblem(body, 400, "ValidationFailed");
        body.TryGetProperty("errors", out _).Should().BeTrue();
    }

    [Fact]
    public async Task WrongFieldType_Returns400_ErrorsKeyedByField()
    {
        var content = new StringContent("{\"number\":\"abc\"}", Encoding.UTF8, "application/json");

        var response = await Client.PostAsync("/api/testprobe/echo", content);

        var body = await ProblemAsync(response);
        AssertProblem(body, 400, "ValidationFailed");
        body.GetProperty("errors").EnumerateObject().Select(p => p.Name).Should().Contain("number");
    }

    [Fact]
    public async Task NoToken_Returns401_Unauthenticated()
    {
        var response = await Client.GetAsync("/api/testprobe/secure");

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
        AssertProblem(await ProblemAsync(response), 401, "Unauthenticated");
    }

    [Fact]
    public async Task UnknownRoute_Returns404_NotFound()
    {
        var response = await Client.GetAsync("/api/does-not-exist");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        AssertProblem(await ProblemAsync(response), 404, "NotFound");
    }

    [Fact]
    public async Task GuidConstraintMismatch_Returns404_NotFound()
    {
        var response = await Client.GetAsync("/api/posts/not-a-guid");

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        AssertProblem(await ProblemAsync(response), 404, "NotFound");
    }

    [Fact]
    public async Task EntityNotFound_FollowMissingUser_Returns404()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsync($"/api/users/{Guid.NewGuid()}/relations/follow", null);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        AssertProblem(await ProblemAsync(response), 404, "NotFound");
    }

    [Fact]
    public async Task NonAuthorEditPost_IsNotA500()
    {
        var demo = await LoginAsync(Seed.DemoLogin);

        var response = await demo.PutAsJsonAsync($"/api/posts/{SeedIds.TestPost.Value}", new { content = "x" });

        ((int)response.StatusCode).Should().BeInRange(400, 499);
        (await ProblemAsync(response)).GetProperty("code").GetString().Should().NotBeNullOrEmpty();
    }

    [Fact]
    public async Task Unhandled_Returns500_InternalError_Development()
    {
        var response = await Client.GetAsync("/api/testprobe/throw/boom");

        response.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        var body = await ProblemAsync(response);
        AssertProblem(body, 500, "InternalError");
        (await response.Content.ReadAsStringAsync()).Should().NotContain(" at YSocial");
    }

    [Fact]
    public async Task Unhandled_Returns500_InternalError_NoDetailOutsideDev()
    {
        using var production = Factory.WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Production");
            b.UseSetting("Jwt:SecretKey", "production-test-secret-0123456789-abcdefghij");
        });
        var client = production.CreateClient(new() { BaseAddress = new Uri("https://localhost"), AllowAutoRedirect = false });

        var response = await client.GetAsync("/api/testprobe/throw/boom");

        response.StatusCode.Should().Be(HttpStatusCode.InternalServerError);
        var raw = await response.Content.ReadAsStringAsync();
        raw.Should().NotContain("secret internal detail").And.NotContain(" at YSocial");
        using var doc = JsonDocument.Parse(raw);
        AssertProblem(doc.RootElement, 500, "InternalError");
    }

    [Fact]
    public async Task ErrorBody_HasTraceIdAndInstance()
    {
        var response = await Client.GetAsync("/api/testprobe/result/notfound");

        var body = await ProblemAsync(response);
        body.GetProperty("traceId").GetString().Should().NotBeNullOrEmpty();
        body.GetProperty("instance").GetString().Should().Be("/api/testprobe/result/notfound");
    }

    [Fact]
    public async Task LikeWithEmptyTargetId_Returns400_Problem()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsync($"/api/posts/{Guid.Empty}/like", null);

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        AssertProblem(await ProblemAsync(response), 400, "ValidationFailed");
    }
}
