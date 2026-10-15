using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Posts;

public class PostReadTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static readonly string[] PostFields =
    [
        "id", "kind", "postId", "content", "createdAt", "isEdited", "likesCount", "commentsCount",
        "isLikedByCurrentUser", "isBookmarkedByCurrentUser", "user", "visibility"
    ];

    private static string PostUrl(Guid id) => $"/api/posts/{id}";

    private static async Task<JsonElement> JsonAsync(HttpResponseMessage response)
    {
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        return doc.RootElement.Clone();
    }

    private static async Task<Guid> AddCommentAsync(HttpClient client, Guid postId, string content = "c", Guid? parentId = null)
    {
        var response = await client.PostAsJsonAsync("/api/comments", new { postId, content, parentCommentId = parentId });
        response.EnsureSuccessStatusCode();
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        // Raw guid until T2.5 (PostDto), id afterwards
        return doc.RootElement.ValueKind == JsonValueKind.String ? doc.RootElement.GetGuid() : doc.RootElement.GetProperty("id").GetGuid();
    }

    [Fact]
    public async Task GetPost_AuthorSnapshot()
    {
        var response = await Client.GetAsync(PostUrl(SeedIds.TestPost.Value));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        body.GetProperty("id").GetGuid().Should().Be(SeedIds.TestPost.Value);
        body.GetProperty("kind").GetString().Should().Be("post");
        body.GetProperty("postId").GetGuid().Should().Be(SeedIds.TestPost.Value);
        body.GetProperty("content").GetString().Should().Be("Welcome to YSocial!");
        body.GetProperty("visibility").GetString().Should().Be("public");
        body.GetProperty("isEdited").GetBoolean().Should().BeFalse();
        var user = body.GetProperty("user");
        user.GetProperty("id").GetGuid().Should().Be(SeedIds.TestUser.Value);
        user.GetProperty("username").GetString().Should().Be("test_user");
        user.GetProperty("displayName").GetString().Should().Be("test_user");
        user.GetProperty("isVerified").GetBoolean().Should().BeFalse();
        body.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(PostFields, "posts carry neither parentId nor imageUrl when absent");
    }

    [Fact]
    public async Task GetPost_ImageUrl_PresentOnlyWhenSet()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var created = await JsonAsync(await test.PostAsJsonAsync("/api/posts", new { content = "pic", imageUrl = "https://img.test/a.png" }));

        var body = await JsonAsync(await Client.GetAsync(PostUrl(created.GetProperty("id").GetGuid())));

        body.GetProperty("imageUrl").GetString().Should().Be("https://img.test/a.png");
    }

    [Fact]
    public async Task GetPost_ViewerFlags_AfterLikeAndBookmark()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync($"/api/posts/{SeedIds.DemoPost.Value}/like", null);
        await test.PutAsync($"/api/posts/{SeedIds.DemoPost.Value}/bookmark", null);

        var viewer = await JsonAsync(await test.GetAsync(PostUrl(SeedIds.DemoPost.Value)));
        var other = await JsonAsync(await (await LoginAsync(Seed.AdminLogin, "admin")).GetAsync(PostUrl(SeedIds.DemoPost.Value)));

        viewer.GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeTrue();
        viewer.GetProperty("isBookmarkedByCurrentUser").GetBoolean().Should().BeTrue();
        viewer.GetProperty("likesCount").GetInt32().Should().Be(1);
        other.GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeFalse();
        other.GetProperty("isBookmarkedByCurrentUser").GetBoolean().Should().BeFalse();
        other.GetProperty("likesCount").GetInt32().Should().Be(1);
    }

    [Fact]
    public async Task GetPost_Anonymous_FlagsFalse()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync($"/api/posts/{SeedIds.DemoPost.Value}/like", null);

        var body = await JsonAsync(await Client.GetAsync(PostUrl(SeedIds.DemoPost.Value)));

        body.GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeFalse();
        body.GetProperty("isBookmarkedByCurrentUser").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task GetPost_CommentsCount_DirectVisibleOnly()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var postId = SeedIds.DemoPost.Value;

        var visible = await AddCommentAsync(test, postId);
        var deleted = await AddCommentAsync(test, postId);
        await test.DeleteAsync($"/api/comments/{deleted}");
        await AddCommentAsync(demo, postId, "nested reply", visible); // nested: never counted on the post
        await AddCommentAsync(admin, postId);                          // author blocked by the viewer below
        (await test.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        var asViewer = await JsonAsync(await test.GetAsync(PostUrl(postId)));
        var anonymous = await JsonAsync(await Client.GetAsync(PostUrl(postId)));

        asViewer.GetProperty("commentsCount").GetInt32().Should().Be(1);
        anonymous.GetProperty("commentsCount").GetInt32().Should().Be(2);
    }

    [Fact]
    public async Task GetPost_PrivateAuthorNonFollower_404()
    {
        MockDataStore.Users[SeedIds.DemoUser].UpdatePrivacySettings(new PrivacySettings(true, true, true));

        (await Client.GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await (await LoginAsync(Seed.TestLogin)).GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await (await LoginAsync(Seed.DemoLogin)).GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.OK, "the author sees own post");
    }

    [Fact]
    public async Task GetPost_PrivateAuthor_AcceptedFollowerSees()
    {
        MockDataStore.Users[SeedIds.DemoUser].UpdatePrivacySettings(new PrivacySettings(true, true, true));
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);
        MockDataStore.UserRelations.Values.Single().AcceptFollow();

        (await test.GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetPost_FollowersOnlyVisibility_HiddenFromNonFollower()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var test = await LoginAsync(Seed.TestLogin);
        MockDataStore.Posts[SeedIds.DemoPost].UpdateSettings(PostVisibility.FollowersOnly, true);

        (await test.GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await demo.GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task GetPost_BlockedEitherWay_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/blocks", null);

        (await test.GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await demo.GetAsync(PostUrl(SeedIds.TestPost.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Client.GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.OK, "anonymous is unaffected");
    }

    [Fact]
    public async Task GetPost_DeletedAuthorProfile_404()
    {
        MockDataStore.Users[SeedIds.DemoUser].Delete(isAccountDeletion: true);

        (await Client.GetAsync(PostUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task CreatePost_201_PostDtoKindPost_Location()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsJsonAsync("/api/posts", new { content = "fresh" });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await JsonAsync(response);
        var id = body.GetProperty("id").GetGuid();
        response.Headers.Location!.ToString().Should().EndWith($"/api/posts/{id}");
        body.GetProperty("kind").GetString().Should().Be("post");
        body.GetProperty("postId").GetGuid().Should().Be(id);
        body.GetProperty("user").GetProperty("id").GetGuid().Should().Be(SeedIds.TestUser.Value);
        body.GetProperty("likesCount").GetInt32().Should().Be(0);
        body.GetProperty("commentsCount").GetInt32().Should().Be(0);
        body.GetProperty("isEdited").GetBoolean().Should().BeFalse();
    }

    [Fact]
    public async Task UpdatePost_200_IsEditedTrue()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsJsonAsync(PostUrl(SeedIds.TestPost.Value), new { content = "edited" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await JsonAsync(response);
        body.GetProperty("content").GetString().Should().Be("edited");
        body.GetProperty("isEdited").GetBoolean().Should().BeTrue();
        body.GetProperty("kind").GetString().Should().Be("post");
    }

    [Fact]
    public async Task GetPost_NoPostInfoShape()
    {
        var raw = await (await Client.GetAsync(PostUrl(SeedIds.TestPost.Value))).Content.ReadAsStringAsync();

        raw.Should().NotContain("authorName").And.NotContain("authorId");
    }
}
