using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Interactions;

/// <summary>
/// D14: writes on hidden/blocked content are 404 (never 403, never partial success).
/// </summary>
public class InteractionEnforcementTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static Guid DemoPost => SeedIds.DemoPost.Value;

    private static void MakePrivate(UserId id)
        => MockDataStore.Users[id].UpdatePrivacySettings(new PrivacySettings(true, true, true));

    private static async Task BlockAsync(HttpClient blocker, UserId target)
        => (await blocker.PostAsync($"/api/users/{target.Value}/blocks", null)).EnsureSuccessStatusCode();

    [Fact]
    public async Task Like_PrivatePostNonFollower_404()
    {
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync($"/api/posts/{DemoPost}/like", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        MockDataStore.Likes.Should().BeEmpty();
        MockDataStore.Posts[SeedIds.DemoPost].LikeCount.Should().Be(0);
    }

    [Fact]
    public async Task Like_PrivateAccount_AcceptedFollower_Allowed()
    {
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);
        await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null);
        MockDataStore.UserRelations.Values.Single().AcceptFollow();

        (await test.PutAsync($"/api/posts/{DemoPost}/like", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Like_FollowersOnlyPost_NonFollower_404()
    {
        MockDataStore.Posts[SeedIds.DemoPost].UpdateSettings(PostVisibility.FollowersOnly, true);
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync($"/api/posts/{DemoPost}/like", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Like_BlockedEitherWay_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        await BlockAsync(test, SeedIds.DemoUser);

        (await test.PutAsync($"/api/posts/{DemoPost}/like", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await demo.PutAsync($"/api/posts/{SeedIds.TestPost.Value}/like", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Like_UnlikeOfAlreadyLikedPost_StillWorksAfterVisibilityRevoked_AsNotFound()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync($"/api/posts/{DemoPost}/like", null);
        MakePrivate(SeedIds.DemoUser);

        // Hidden content is 404 for every interaction, including undoing an earlier one
        (await test.DeleteAsync($"/api/posts/{DemoPost}/like")).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Like_CommentUnderHiddenPost_404()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var comment = await demo.AddCommentAsync(DemoPost, "hello");
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync($"/api/comments/{comment}/like", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Like_CommentByBlockedAuthor_404()
    {
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var test = await LoginAsync(Seed.TestLogin);
        var comment = await admin.AddCommentAsync(DemoPost, "by admin");
        await BlockAsync(test, SeedIds.AdminUser);

        (await test.PutAsync($"/api/comments/{comment}/like", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Bookmark_BlockedAuthor_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await BlockAsync(test, SeedIds.DemoUser);

        (await test.PutAsync($"/api/posts/{DemoPost}/bookmark", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        MockDataStore.SavedItems.Should().BeEmpty();
    }

    [Fact]
    public async Task Bookmark_PrivatePostNonFollower_404_AndCommentToo()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var comment = await demo.AddCommentAsync(DemoPost, "c");
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync($"/api/posts/{DemoPost}/bookmark", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await test.PutAsync($"/api/comments/{comment}/bookmark", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Comment_BlockedEitherWay_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        await BlockAsync(demo, SeedIds.TestUser);

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = DemoPost, content = "hi", parentCommentId = (Guid?)null });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        MockDataStore.Comments.Should().BeEmpty();

        // and the other direction
        var reverse = await demo.PostAsJsonAsync("/api/comments", new { postId = SeedIds.TestPost.Value, content = "hi", parentCommentId = (Guid?)null });
        reverse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Comment_PrivatePostNonFollower_404()
    {
        MakePrivate(SeedIds.DemoUser);
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = DemoPost, content = "hi", parentCommentId = (Guid?)null });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task BlockMissingUser_404()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PostAsync($"/api/users/{Guid.NewGuid()}/blocks", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
        MockDataStore.UserBlocks.Should().BeEmpty();
    }

    [Fact]
    public async Task BlockDeletedUser_404()
    {
        MockDataStore.Users[SeedIds.TestUserAlt].Delete(isAccountDeletion: true);
        var demo = await LoginAsync(Seed.DemoLogin);

        (await demo.PostAsync($"/api/users/{SeedIds.TestUserAlt.Value}/blocks", null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task BlockSelf_StillBadRequest()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PostAsync($"/api/users/{SeedIds.TestUser.Value}/blocks", null)).StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Like_OwnContent_Allowed_EvenWhenPrivate()
    {
        MakePrivate(SeedIds.TestUser);
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync($"/api/posts/{SeedIds.TestPost.Value}/like", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.PutAsync($"/api/posts/{SeedIds.TestPost.Value}/bookmark", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task Like_PublicPost_ByStranger_Allowed()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync($"/api/posts/{DemoPost}/like", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.PutAsync($"/api/posts/{DemoPost}/bookmark", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }
}
