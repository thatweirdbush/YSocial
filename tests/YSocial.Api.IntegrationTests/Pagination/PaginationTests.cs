using FluentAssertions;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Application.CQRS.Behaviors.UnitOfWork;
using YSocial.Application.Features.Posts.GetPost;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Pagination;

public class PaginationTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static string UserPosts(string query = "") => $"/api/posts/user/{SeedIds.TestUser.Value}{query}";

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private async Task CreatePostsAsync(HttpClient client, int count)
    {
        for (var i = 1; i <= count; i++)
        {
            (await client.PostAsJsonAsync("/api/posts", new { content = $"post {i}", imageUrl = "https://img.test/a.png" })).EnsureSuccessStatusCode();
        }
    }

    [Theory]
    [InlineData("?pageSize=0")]
    [InlineData("?pageSize=51")]
    [InlineData("?pageSize=-1")]
    [InlineData("?page=0")]
    [InlineData("?page=-3")]
    public async Task UserPosts_InvalidPaging_Returns400_ValidationFailed(string query)
    {
        var response = await Client.GetAsync(UserPosts(query));

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("ValidationFailed");
    }

    [Fact]
    public async Task UserPosts_PageBeyondLast_Returns200EmptyWithMetadata()
    {
        var response = await Client.GetAsync(UserPosts("?page=5&pageSize=10"));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        body.GetProperty("items").GetArrayLength().Should().Be(0);
        body.GetProperty("totalCount").GetInt32().Should().Be(1);
        body.GetProperty("page").GetInt32().Should().Be(5);
        body.GetProperty("hasNextPage").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task GetPost_EmptyGuid_Returns400()
    {
        var response = await Client.GetAsync($"/api/posts/{Guid.Empty}");

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await JsonAsync(response)).GetProperty("code").GetString().Should().Be("ValidationFailed");
    }

    [Fact]
    public async Task UserPosts_Default_Returns10NewestFirst()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await CreatePostsAsync(test, 11); // + 1 seed post = 12

        var response = await Client.GetAsync(UserPosts());

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        var items = body.GetProperty("items").EnumerateArray().ToList();
        items.Should().HaveCount(10);
        body.GetProperty("totalCount").GetInt32().Should().Be(12);
        body.GetProperty("hasNextPage").GetBoolean().Should().BeTrue();
        items.Select(i => i.GetProperty("createdAt").GetDateTime()).Should().BeInDescendingOrder();
        items[0].GetProperty("content").GetString().Should().Be("post 11");
    }

    [Fact]
    public void Queries_NeverTriggerUnitOfWorkCommit()
    {
        var responseType = typeof(GetPostQuery).GetInterfaces()
            .First(i => i.IsGenericType && i.GetGenericTypeDefinition() == typeof(IRequest<>))
            .GetGenericArguments()[0];
        var behaviorType = typeof(IPipelineBehavior<,>).MakeGenericType(typeof(GetPostQuery), responseType);

        using var scope = Factory.Services.CreateScope();
        var behaviors = scope.ServiceProvider.GetServices(behaviorType).Select(b => b!.GetType().GetGenericTypeDefinition()).ToList();

        behaviors.Should().NotContain(typeof(TransactionBehavior<,>));
    }
}
