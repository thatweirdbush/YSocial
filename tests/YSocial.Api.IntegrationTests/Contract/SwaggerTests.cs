using FluentAssertions;
using System.Net;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;

namespace YSocial.Api.IntegrationTests.Contract;

/// <summary>
/// Pins the published contract (the generated swagger copy for FE is regenerated from this document).
/// </summary>
public class SwaggerTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private async Task<JsonElement> SwaggerAsync()
    {
        var response = await Client.GetAsync("/swagger/v1/swagger.json");
        response.StatusCode.Should().Be(HttpStatusCode.OK);
        return await response.ReadJsonAsync();
    }

    private static string? SchemaRef(JsonElement document, string path, string method, string status)
    {
        var response = document.GetProperty("paths").GetProperty(path).GetProperty(method).GetProperty("responses");
        if (!response.TryGetProperty(status, out var item)) return null;
        if (!item.TryGetProperty("content", out var content)) return "";

        var media = content.EnumerateObject().First().Value;
        if (!media.TryGetProperty("schema", out var schema)) return "";
        return schema.TryGetProperty("$ref", out var reference) ? reference.GetString()!.Split('/').Last() : "inline";
    }

    public static IEnumerable<object[]> MvpResponses =>
    [
        ["/api/identities/register", "post", "201", "RegisterAccountResponse"],
        ["/api/identities/login", "post", "200", "LoginResponse"],
        ["/api/identities/refresh-token", "post", "200", "LoginResponse"],
        ["/api/users/me", "get", "200", "MeDto"],
        ["/api/users/{id}", "get", "200", "UserProfileDto"],
        ["/api/users/by-username/{username}", "get", "200", "UserProfileDto"],
        ["/api/users/profiles/me", "put", "200", "UserProfileDto"],
        ["/api/users/profiles/switch", "put", "200", "LoginResponse"],
        ["/api/posts", "post", "201", "PostDto"],
        ["/api/posts/{id}", "get", "200", "PostDto"],
        ["/api/posts/{id}", "put", "200", "PostDto"],
        ["/api/posts/user/{userId}", "get", "200", "UserPostsPageDto"],
        ["/api/saveditems/posts", "get", "200", "PostDtoPagedResponse"],
        ["/api/threads/{id}", "get", "200", "ThreadDto"],
        ["/api/comments", "post", "201", "PostDto"],
        ["/api/comments/{id}", "put", "200", "PostDto"],
        ["/api/users/{targetId}/relations/follow", "post", "200", "FollowUserResponse"],
        ["/api/likes/toggle", "post", "200", "ToggleLikeResponse"],
        ["/api/saveditems/toggle", "post", "200", "ToggleSavedItemResponse"],
        ["/api/posts/{id}", "delete", "204", ""],
        ["/api/posts/{id}/like", "put", "204", ""],
        ["/api/posts/{id}/like", "delete", "204", ""],
        ["/api/comments/{id}/like", "put", "204", ""],
        ["/api/posts/{id}/bookmark", "put", "204", ""],
        ["/api/comments/{id}/bookmark", "delete", "204", ""],
        ["/api/identities/logout", "post", "204", ""]
    ];

    [Fact]
    public async Task Swagger_Builds()
    {
        var document = await SwaggerAsync();

        document.GetProperty("paths").EnumerateObject().Should().NotBeEmpty();
        document.GetProperty("paths").EnumerateObject().Select(p => p.Name).Should().NotContain(p => p.Contains("testprobe"));
    }

    [Theory]
    [MemberData(nameof(MvpResponses))]
    public async Task Swagger_MvpEndpoints_HaveResponseSchemas(string path, string method, string status, string expectedSchema)
    {
        var document = await SwaggerAsync();

        SchemaRef(document, path, method, status).Should().Be(expectedSchema, $"{method.ToUpper()} {path} -> {status}");
    }

    [Fact]
    public async Task Swagger_ErrorResponses_UseProblemDetails()
    {
        var document = await SwaggerAsync();
        var offenders = new List<string>();

        foreach (var path in document.GetProperty("paths").EnumerateObject())
        foreach (var operation in path.Value.EnumerateObject())
        foreach (var response in operation.Value.GetProperty("responses").EnumerateObject())
        {
            if (!int.TryParse(response.Name, out var status) || status < 400) continue;

            var schema = SchemaRef(document, path.Name, operation.Name, response.Name);
            if (schema != "ProblemDetails") offenders.Add($"{operation.Name.ToUpper()} {path.Name} {response.Name} -> {schema}");
        }

        offenders.Should().BeEmpty();
        document.GetProperty("components").GetProperty("schemas").TryGetProperty("ProblemDetails", out _).Should().BeTrue();
    }

    [Fact]
    public async Task Swagger_PostDto_MatchesContract()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("PostDto").GetProperty("properties")
            .EnumerateObject().Select(p => p.Name);

        properties.Should().BeEquivalentTo(
        [
            "id", "kind", "postId", "parentId", "content", "imageUrl", "createdAt", "isEdited", "likesCount", "commentsCount",
            "isLikedByCurrentUser", "isBookmarkedByCurrentUser", "user", "visibility"
        ]);
    }

    [Fact]
    public async Task Swagger_UserProfileDto_MatchesContract()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("UserProfileDto").GetProperty("properties")
            .EnumerateObject().Select(p => p.Name);

        properties.Should().BeEquivalentTo(
        [
            "id", "username", "displayName", "bio", "avatarUrl", "coverUrl", "followersCount", "followingCount", "isPrivate",
            "isVerified", "followStatus", "isFollowing", "viewerMarkedCloseFriend", "isMuted", "isBlocked", "isBlockedBy"
        ]);
    }
}
