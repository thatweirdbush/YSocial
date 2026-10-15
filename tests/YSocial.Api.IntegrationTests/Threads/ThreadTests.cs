using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Threads;

public class ThreadTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static string Thread(Guid id) => $"/api/threads/{id}";

    private static IReadOnlyList<string> Contents(JsonElement array)
        => array.EnumerateArray().Select(i => i.GetProperty("content").GetString()!).ToList();

    private static Guid PostId => SeedIds.DemoPost.Value;

    private static async Task<Guid> ReplyAsync(HttpClient client, Guid postId, Guid? parentId, string content)
    {
        var id = await client.AddCommentAsync(postId, content, parentId);
        await Task.Delay(3); // distinct CreatedAt for ordering assertions
        return id;
    }

    #region Read

    [Fact]
    public async Task Thread_ByPostId_RepliesNewestFirst()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await ReplyAsync(test, PostId, null, "first");
        await ReplyAsync(test, PostId, null, "second");
        await ReplyAsync(test, PostId, null, "third");

        var response = await Client.GetAsync(Thread(PostId));

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadJsonAsync();
        body.EnumerateObject().Select(p => p.Name).Should().BeEquivalentTo(["post", "parent", "replies", "childReplies"]);
        body.GetProperty("post").GetProperty("id").GetGuid().Should().Be(PostId);
        body.GetProperty("post").GetProperty("kind").GetString().Should().Be("post");
        body.GetProperty("parent").ValueKind.Should().Be(JsonValueKind.Null);
        Contents(body.GetProperty("replies")).Should().Equal("third", "second", "first");
        body.GetProperty("post").GetProperty("commentsCount").GetInt32().Should().Be(3);
    }

    [Fact]
    public async Task Thread_ByCommentId_ParentIsParentComment()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var top = await ReplyAsync(test, PostId, null, "top");
        var reply = await ReplyAsync(test, PostId, top, "reply");
        await ReplyAsync(test, PostId, reply, "nested");

        var body = await (await Client.GetAsync(Thread(reply))).ReadJsonAsync();

        body.GetProperty("post").GetProperty("kind").GetString().Should().Be("comment");
        body.GetProperty("post").GetProperty("parentId").GetGuid().Should().Be(top);
        body.GetProperty("post").GetProperty("postId").GetGuid().Should().Be(PostId);
        body.GetProperty("parent").GetProperty("id").GetGuid().Should().Be(top);
        body.GetProperty("parent").GetProperty("kind").GetString().Should().Be("comment");
        Contents(body.GetProperty("replies")).Should().Equal("nested");
    }

    [Fact]
    public async Task Thread_ByTopLevelCommentId_ParentIsRootPost()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var top = await ReplyAsync(test, PostId, null, "top");

        var body = await (await Client.GetAsync(Thread(top))).ReadJsonAsync();

        body.GetProperty("post").GetProperty("parentId").GetGuid().Should().Be(PostId, "a top-level comment points at the root post");
        body.GetProperty("parent").GetProperty("id").GetGuid().Should().Be(PostId);
        body.GetProperty("parent").GetProperty("kind").GetString().Should().Be("post");
    }

    [Fact]
    public async Task Thread_ChildReplies_OneLevelBelowReplies_NewestFirst()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var r1 = await ReplyAsync(test, PostId, null, "r1");
        var r2 = await ReplyAsync(test, PostId, null, "r2");
        var c1 = await ReplyAsync(test, PostId, r1, "r1-c1");
        await ReplyAsync(test, PostId, r1, "r1-c2");
        await ReplyAsync(test, PostId, c1, "deeper, not included");

        var body = await (await Client.GetAsync(Thread(PostId))).ReadJsonAsync();

        var child = body.GetProperty("childReplies");
        Contents(child.GetProperty(r1.ToString())).Should().Equal("r1-c2", "r1-c1");
        child.TryGetProperty(r2.ToString(), out var r2Children).Should().BeTrue("every reply has an entry");
        r2Children.GetArrayLength().Should().Be(0);
        child.EnumerateObject().Should().HaveCount(2, "one level only");
    }

    [Fact]
    public async Task Thread_ExcludesDeletedAndBlockedReplies()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var demo = await LoginAsync(Seed.DemoLogin);
        await ReplyAsync(test, PostId, null, "visible");
        var gone = await ReplyAsync(test, PostId, null, "deleted");
        await ReplyAsync(admin, PostId, null, "from blocked");
        await test.DeleteAsync($"/api/comments/{gone}");
        (await demo.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null)).EnsureSuccessStatusCode();

        var asDemo = await (await demo.GetAsync(Thread(PostId))).ReadJsonAsync();
        var anonymous = await (await Client.GetAsync(Thread(PostId))).ReadJsonAsync();

        Contents(asDemo.GetProperty("replies")).Should().Equal("visible");
        Contents(anonymous.GetProperty("replies")).Should().BeEquivalentTo(["from blocked", "visible"]);
    }

    [Fact]
    public async Task Thread_ReplyCommentsCount_MatchesChildReplies()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var demo = await LoginAsync(Seed.DemoLogin);
        var reply = await ReplyAsync(test, PostId, null, "reply");
        await ReplyAsync(test, PostId, reply, "visible child");
        var deleted = await ReplyAsync(test, PostId, reply, "deleted child");
        await ReplyAsync(admin, PostId, reply, "blocked child");
        await test.DeleteAsync($"/api/comments/{deleted}");
        await demo.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null);

        foreach (var client in new[] { demo, Client })
        {
            var body = await (await client.GetAsync(Thread(PostId))).ReadJsonAsync();

            var replyDto = body.GetProperty("replies").EnumerateArray().Single();
            var children = body.GetProperty("childReplies").GetProperty(reply.ToString());
            replyDto.GetProperty("commentsCount").GetInt32().Should().Be(children.GetArrayLength());
        }
    }

    [Fact]
    public async Task Thread_HiddenRepliesNotCounted()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var demo = await LoginAsync(Seed.DemoLogin);
        await ReplyAsync(test, PostId, null, "one");
        await ReplyAsync(admin, PostId, null, "hidden by block");
        await demo.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null);

        var body = await (await demo.GetAsync(Thread(PostId))).ReadJsonAsync();

        body.GetProperty("post").GetProperty("commentsCount").GetInt32().Should().Be(1);
        body.GetProperty("replies").GetArrayLength().Should().Be(1);
    }

    [Fact]
    public async Task Thread_HiddenRoot_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var comment = await ReplyAsync(test, PostId, null, "under demo post");
        MockDataStore.Users[SeedIds.DemoUser].UpdatePrivacySettings(new PrivacySettings(true, true, true));
        var admin = await LoginAsync(Seed.AdminLogin, "admin");

        (await admin.GetAsync(Thread(PostId))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await admin.GetAsync(Thread(comment))).StatusCode.Should().Be(HttpStatusCode.NotFound, "a comment inherits its root post access");
        (await Client.GetAsync(Thread(PostId))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Thread_UnknownOrDeleted_404()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var comment = await ReplyAsync(test, PostId, null, "to delete");
        await test.DeleteAsync($"/api/comments/{comment}");

        (await Client.GetAsync(Thread(Guid.NewGuid()))).StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await Client.GetAsync(Thread(comment))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Thread_CommentUnderBlockedAuthorParent_ParentNull()
    {
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var parent = await ReplyAsync(admin, PostId, null, "parent by admin");
        var child = await ReplyAsync(test, PostId, parent, "child by test");
        await demo.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null);

        var body = await (await demo.GetAsync(Thread(child))).ReadJsonAsync();

        body.GetProperty("post").GetProperty("id").GetGuid().Should().Be(child);
        body.GetProperty("parent").ValueKind.Should().Be(JsonValueKind.Null, "no stub that reveals the hidden parent exists");
        (await demo.GetAsync(Thread(parent))).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Thread_ViewerFlags_ForCommentsUseCommentTarget()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var comment = await ReplyAsync(test, PostId, null, "likeable");
        await test.PutAsync($"/api/comments/{comment}/like", null);
        await test.PutAsync($"/api/comments/{comment}/bookmark", null);

        var asLiker = await (await test.GetAsync(Thread(PostId))).ReadJsonAsync();
        var anonymous = await (await Client.GetAsync(Thread(PostId))).ReadJsonAsync();

        var reply = asLiker.GetProperty("replies")[0];
        reply.GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeTrue();
        reply.GetProperty("isBookmarkedByCurrentUser").GetBoolean().Should().BeTrue();
        reply.GetProperty("likesCount").GetInt32().Should().Be(1);
        asLiker.GetProperty("post").GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeFalse();
        anonymous.GetProperty("replies")[0].GetProperty("isLikedByCurrentUser").GetBoolean().Should().BeFalse();
    }

    #endregion

    #region Writes

    [Fact]
    public async Task AddComment_201_PostDtoKindComment()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = PostId, content = "nice", parentCommentId = (Guid?)null });

        response.StatusCode.Should().Be(HttpStatusCode.Created);
        var body = await response.ReadJsonAsync();
        var id = body.GetProperty("id").GetGuid();
        response.Headers.Location!.ToString().Should().EndWith($"/api/threads/{id}");
        body.GetProperty("kind").GetString().Should().Be("comment");
        body.GetProperty("postId").GetGuid().Should().Be(PostId);
        body.GetProperty("parentId").GetGuid().Should().Be(PostId);
        body.GetProperty("user").GetProperty("id").GetGuid().Should().Be(SeedIds.TestUser.Value);
        body.GetProperty("content").GetString().Should().Be("nice");
        body.TryGetProperty("imageUrl", out _).Should().BeFalse();
    }

    [Fact]
    public async Task AddComment_Reply_ParentIdIsParentComment()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var top = await test.AddCommentAsync(PostId, "top");

        var body = await (await test.PostAsJsonAsync("/api/comments", new { postId = PostId, content = "reply", parentCommentId = top })).ReadJsonAsync();

        body.GetProperty("parentId").GetGuid().Should().Be(top);
    }

    [Fact]
    public async Task AddComment_ParentFromOtherPost_400_ParentCommentMismatch()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var otherPostComment = await test.AddCommentAsync(SeedIds.TestPost.Value, "elsewhere");

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = PostId, content = "mismatch", parentCommentId = otherPostComment });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("ParentCommentMismatch");
        MockDataStore.Comments.Should().HaveCount(1);
    }

    [Fact]
    public async Task AddComment_ParentSoftDeleted_404_NotFound()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var parent = await test.AddCommentAsync(PostId, "parent");
        await test.DeleteAsync($"/api/comments/{parent}");

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = PostId, content = "orphan", parentCommentId = parent });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("NotFound");
    }

    [Fact]
    public async Task AddComment_ParentUnknown_404()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = PostId, content = "x", parentCommentId = Guid.NewGuid() });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AddComment_ParentInaccessible_404()
    {
        var admin = await LoginAsync(Seed.AdminLogin, "admin");
        var demo = await LoginAsync(Seed.DemoLogin);
        var parent = await admin.AddCommentAsync(PostId, "by admin");
        await demo.PostAsync($"/api/users/{SeedIds.AdminUser.Value}/blocks", null);

        var response = await demo.PostAsJsonAsync("/api/comments", new { postId = PostId, content = "reply to blocked", parentCommentId = parent });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AddComment_UnknownPost_404()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = Guid.NewGuid(), content = "x", parentCommentId = (Guid?)null });

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task AddComment_EmptyContent_400()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PostAsJsonAsync("/api/comments", new { postId = PostId, content = "", parentCommentId = (Guid?)null });

        response.StatusCode.Should().Be(HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task UpdateComment_200_PostDto()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var comment = await test.AddCommentAsync(PostId, "before");

        var response = await test.PutAsJsonAsync($"/api/comments/{comment}", new { content = "after" });

        response.StatusCode.Should().Be(HttpStatusCode.OK);
        var body = await response.ReadJsonAsync();
        body.GetProperty("id").GetGuid().Should().Be(comment);
        body.GetProperty("kind").GetString().Should().Be("comment");
        body.GetProperty("content").GetString().Should().Be("after");
        body.GetProperty("isEdited").GetBoolean().Should().BeTrue();
    }

    [Fact]
    public async Task UpdateComment_ByOtherUser_403()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        var comment = await test.AddCommentAsync(PostId, "mine");

        var response = await demo.PutAsJsonAsync($"/api/comments/{comment}", new { content = "hijack" });

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);
        (await response.ReadJsonAsync()).GetProperty("code").GetString().Should().Be("NotCommentAuthor");
    }

    #endregion
}
