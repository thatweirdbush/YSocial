using FluentAssertions;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Interactions;

/// <summary>
/// D10: idempotent resource routes, no bodies.
/// </summary>
public class SetLikeAndBookmarkTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static string PostLikeUrl(Guid id) => $"/api/posts/{id}/like";

    private async Task<Guid> AddCommentAsync(HttpClient client)
    {
        var response = await client.PostAsJsonAsync("/api/comments", new { postId = SeedIds.DemoPost.Value, content = "hello", parentCommentId = (Guid?)null });
        response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync()).RootElement.GetGuid();
    }

    private static int ActiveSaved() => MockDataStore.SavedItems.Values.Count(s => !s.IsDeleted);

    [Fact]
    public async Task PutPostLike_Twice_LikeCountIs1()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync(PostLikeUrl(SeedIds.DemoPost.Value), null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.PutAsync(PostLikeUrl(SeedIds.DemoPost.Value), null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        MockDataStore.Posts[SeedIds.DemoPost].LikeCount.Should().Be(1);
        MockDataStore.Likes.Should().HaveCount(1);
    }

    [Fact]
    public async Task DeletePostLike_RemovesLike_Idempotently()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync(PostLikeUrl(SeedIds.DemoPost.Value), null);

        (await test.DeleteAsync(PostLikeUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.DeleteAsync(PostLikeUrl(SeedIds.DemoPost.Value))).StatusCode.Should().Be(HttpStatusCode.NoContent);

        MockDataStore.Posts[SeedIds.DemoPost].LikeCount.Should().Be(0);
        MockDataStore.Likes.Should().BeEmpty();
    }

    [Fact]
    public async Task DeletePostLike_WhenNotLiked_Returns204_Unchanged()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.DeleteAsync(PostLikeUrl(SeedIds.DemoPost.Value));

        response.StatusCode.Should().Be(HttpStatusCode.NoContent);
        MockDataStore.Posts[SeedIds.DemoPost].LikeCount.Should().Be(0);
    }

    [Fact]
    public async Task PutCommentLike_UsesCommentTarget()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var test = await LoginAsync(Seed.TestLogin);
        var commentId = await AddCommentAsync(demo);

        (await test.PutAsync($"/api/comments/{commentId}/like", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        MockDataStore.Comments.Values.Single().LikeCount.Should().Be(1);
        MockDataStore.Posts[SeedIds.DemoPost].LikeCount.Should().Be(0);

        (await test.DeleteAsync($"/api/comments/{commentId}/like")).StatusCode.Should().Be(HttpStatusCode.NoContent);
        MockDataStore.Comments.Values.Single().LikeCount.Should().Be(0);
    }

    [Fact]
    public async Task PutPostLike_PostIdIsNotAcceptedAsCommentTarget()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var response = await test.PutAsync($"/api/comments/{SeedIds.DemoPost.Value}/like", null);

        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task PutLike_UnknownTarget_Returns404()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PutAsync(PostLikeUrl(Guid.NewGuid()), null)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task PutLike_Anonymous_Returns401()
    {
        (await Client.PutAsync(PostLikeUrl(SeedIds.DemoPost.Value), null)).StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task PutBookmark_Twice_SingleSavedRow()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var url = $"/api/posts/{SeedIds.DemoPost.Value}/bookmark";

        (await test.PutAsync(url, null)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.PutAsync(url, null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        MockDataStore.SavedItems.Should().HaveCount(1);
        MockDataStore.Posts[SeedIds.DemoPost].SavedCount.Should().Be(1);
    }

    [Fact]
    public async Task DeleteBookmark_RemovesSaved_Idempotently()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var url = $"/api/posts/{SeedIds.DemoPost.Value}/bookmark";
        await test.PutAsync(url, null);

        (await test.DeleteAsync(url)).StatusCode.Should().Be(HttpStatusCode.NoContent);
        (await test.DeleteAsync(url)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        ActiveSaved().Should().Be(0);
        MockDataStore.Posts[SeedIds.DemoPost].SavedCount.Should().Be(0);
    }

    [Fact]
    public async Task PutCommentBookmark_UsesCommentTarget()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var test = await LoginAsync(Seed.TestLogin);
        var commentId = await AddCommentAsync(demo);

        (await test.PutAsync($"/api/comments/{commentId}/bookmark", null)).StatusCode.Should().Be(HttpStatusCode.NoContent);

        MockDataStore.SavedItems.Values.Should().ContainSingle(s => s.TargetId == commentId && !s.IsDeleted);
    }

    [Fact]
    public async Task DeleteRoute_HasNoBody()
    {
        var test = await LoginAsync(Seed.TestLogin);
        await test.PutAsync(PostLikeUrl(SeedIds.DemoPost.Value), null);

        var request = new HttpRequestMessage(HttpMethod.Delete, PostLikeUrl(SeedIds.DemoPost.Value));
        request.Content.Should().BeNull();

        (await test.SendAsync(request)).StatusCode.Should().Be(HttpStatusCode.NoContent);
    }

    [Fact]
    public async Task ToggleEndpoints_Unchanged()
    {
        var test = await LoginAsync(Seed.TestLogin);

        var like = await test.PostAsJsonAsync("/api/likes/toggle", new { targetId = SeedIds.DemoPost.Value, targetType = 1 });
        var save = await test.PostAsJsonAsync("/api/saveditems/toggle", new { targetId = SeedIds.DemoPost.Value, targetType = 1 });

        (await like.Content.ReadAsStringAsync()).Should().Contain("isLiked");
        (await save.Content.ReadAsStringAsync()).Should().Contain("isSaved");
    }
}
