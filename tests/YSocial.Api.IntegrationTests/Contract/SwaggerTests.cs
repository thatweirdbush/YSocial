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
        ["/api/users/me/follow-requests", "get", "200", "FollowListPageDto"],
        ["/api/users/me/follow-requests/count", "get", "200", "FollowRequestCountDto"],
        ["/api/users/profiles/me/privacy", "put", "200", "PrivacyUpdatedDto"],
        ["/api/users/{id}/followers", "get", "200", "FollowListPageDto"],
        ["/api/users/{id}/following", "get", "200", "FollowListPageDto"],
        ["/api/users/me/relation-sets", "get", "200", "RelationSetsDto"],
        ["/api/users/me/blocks", "get", "200", "UserProfileDtoPagedResponse"],
        ["/api/posts/{id}", "delete", "204", ""],
        ["/api/posts/{id}/like", "put", "204", ""],
        ["/api/posts/{id}/like", "delete", "204", ""],
        ["/api/comments/{id}/like", "put", "204", ""],
        ["/api/posts/{id}/bookmark", "put", "204", ""],
        ["/api/comments/{id}/bookmark", "delete", "204", ""],
        ["/api/identities/logout", "post", "204", ""],
        ["/api/identities/sessions", "get", "200", "inline"],
        ["/api/identities/sessions/{id}", "delete", "204", ""],
        ["/api/users/{targetId}/relations/mute", "put", "204", ""],
        ["/api/users/{targetId}/relations/mute", "delete", "204", ""],
        ["/api/users/me/mutes", "get", "200", "UserProfileDtoPagedResponse"],
        ["/api/feed", "get", "200", "PostDtoPagedResponse"],
        ["/api/trending/tags", "get", "200", "inline"],
        ["/api/tags/{tag}/posts", "get", "200", "TagPostsPageDto"],
        ["/api/users/suggestions", "get", "200", "UserProfileDtoPagedResponse"],
        ["/api/notifications", "get", "200", "NotificationPageDto"],
        ["/api/notifications/preferences", "get", "200", "NotificationPreferencesDto"],
        ["/api/notifications/preferences", "put", "200", "NotificationPreferencesDto"],
        ["/api/notifications/unread-count", "get", "200", "UnreadCountDto"],
        ["/api/notifications/{id}/read", "put", "204", ""],
        ["/api/notifications/read-all", "put", "204", ""],
        ["/api/posts/{id}/share-link", "post", "200", "SharePostLinkResponse"]
    ];

    [Fact]
    public async Task Swagger_Builds()
    {
        var document = await SwaggerAsync();

        document.GetProperty("paths").EnumerateObject().Should().NotBeEmpty();
        document.GetProperty("paths").EnumerateObject().Select(p => p.Name).Should().NotContain(p => p.Contains("testprobe"));
    }

    [Fact]
    public async Task Swagger_HasNoToggleLikeOrSaveEndpoints()
    {
        var paths = (await SwaggerAsync()).GetProperty("paths").EnumerateObject().Select(p => p.Name).ToList();

        paths.Should().NotContain(["/api/likes/toggle", "/api/saveditems/toggle"]);
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
            "isLikedByCurrentUser", "isBookmarkedByCurrentUser", "user", "visibility", "media"
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

    [Fact]
    public async Task Swagger_NotificationDto_MatchesContract()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("NotificationDto").GetProperty("properties")
            .EnumerateObject().Select(p => p.Name);

        properties.Should().BeEquivalentTo(
            ["id", "type", "kind", "title", "message", "createdAt", "isRead", "targetId", "senderId", "senderName", "senderUsername", "senderAvatar"]);
    }

    [Fact]
    public async Task Swagger_MeDto_CarriesOwnerDemographics()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("MeDto").GetProperty("properties");

        properties.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(["profile", "email", "profiles", "gender", "dateOfBirth"]);
        properties.GetProperty("dateOfBirth").GetProperty("format").GetString().Should().Be("date");
    }

    [Fact]
    public async Task Swagger_SessionDto_MatchesContract()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("SessionDto").GetProperty("properties")
            .EnumerateObject().Select(p => p.Name);

        properties.Should().BeEquivalentTo(["id", "userAgent", "profileUsername", "createdAt", "lastTokenIssuedAt", "isCurrent"]);
    }

    [Fact]
    public async Task Swagger_UploadMedia_IsMultipart_WithFilesAndPurpose_AndTypedResponses()
    {
        var document = await SwaggerAsync();
        var post = document.GetProperty("paths").GetProperty("/api/media").GetProperty("post");

        var multipart = post.GetProperty("requestBody").GetProperty("content").GetProperty("multipart/form-data").GetProperty("schema");
        var properties = multipart.GetProperty("properties");
        properties.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(["files", "purpose"]);
        properties.GetProperty("files").GetProperty("type").GetString().Should().Be("array");
        properties.GetProperty("files").GetProperty("items").GetProperty("format").GetString().Should().Be("binary");

        post.GetProperty("responses").EnumerateObject().Select(r => r.Name).Should()
            .BeEquivalentTo(["201", "400", "401", "409", "413", "429", "500", "503"]);
        var created = post.GetProperty("responses").GetProperty("201").GetProperty("content").EnumerateObject().First().Value.GetProperty("schema");
        created.GetProperty("type").GetString().Should().Be("array");
        created.GetProperty("items").GetProperty("$ref").GetString().Should().EndWith("MediaDto");
    }

    [Fact]
    public async Task Swagger_DiscardMedia_Is204_With401_404_503()
    {
        var document = await SwaggerAsync();

        var responses = document.GetProperty("paths").GetProperty("/api/media/{id}").GetProperty("delete").GetProperty("responses");

        responses.EnumerateObject().Select(r => r.Name).Should().BeEquivalentTo(["204", "401", "404", "500", "503"]);
    }

    [Fact]
    public async Task Swagger_MediaDto_MatchesContract()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("MediaDto").GetProperty("properties")
            .EnumerateObject().Select(p => p.Name);

        properties.Should().BeEquivalentTo(["id", "kind", "url", "posterUrl", "width", "height", "durationSeconds", "bytes"]);
    }

    [Fact]
    public async Task Swagger_CreatePostRequest_HasMediaIds()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("CreatePostRequest").GetProperty("properties");

        properties.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(["content", "imageUrl", "mediaIds"]);
        properties.GetProperty("mediaIds").GetProperty("type").GetString().Should().Be("array");
    }

    [Fact]
    public async Task Swagger_UpdateProfileRequest_AdvertisesAvatarMediaId_ButNotTheInternalPresenceFlag()
    {
        var document = await SwaggerAsync();

        var properties = document.GetProperty("components").GetProperty("schemas").GetProperty("UpdateProfileRequest").GetProperty("properties")
            .EnumerateObject().Select(p => p.Name);

        properties.Should().BeEquivalentTo(["displayName", "bio", "avatarUrl", "avatarMediaId", "coverUrl", "gender", "dateOfBirth"]);
    }

    /// <summary>
    /// Writes the document to the path in <c>YSOCIAL_EXPORT_SWAGGER</c> (FE copy, same content as <c>npm run api:fetch</c> without touching a real database).
    /// </summary>
    [Fact]
    public async Task Export_WhenRequested()
    {
        var target = Environment.GetEnvironmentVariable("YSOCIAL_EXPORT_SWAGGER");
        if (string.IsNullOrEmpty(target)) return;

        await File.WriteAllTextAsync(target, (await Client.GetAsync("/swagger/v1/swagger.json")).Content.ReadAsStringAsync().Result);
    }
}
