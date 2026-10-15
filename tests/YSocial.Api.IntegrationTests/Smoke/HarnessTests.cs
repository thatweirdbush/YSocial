using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;

namespace YSocial.Api.IntegrationTests.Smoke;

public class HarnessTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    [Fact]
    public async Task Smoke_GetSeedPost_Returns200()
    {
        var response = await Client.GetAsync($"/api/posts/{SeedIds.TestPost.Value}");

        response.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task Reset_RestoresSeed_AfterMutation()
    {
        var test = await LoginAsync(Seed.TestLogin);
        (await test.PostAsJsonAsync("/api/posts", new { content = "temp", imageUrl = "https://img.test/a.png" })).EnsureSuccessStatusCode();
        (await test.PostAsync($"/api/users/{SeedIds.DemoUser.Value}/relations/follow", null)).EnsureSuccessStatusCode();

        MockDataStore.Posts.Count.Should().BeGreaterThan(2);
        MockDataStore.Accounts[SeedIds.TestAccount].RefreshTokens.Should().NotBeEmpty();

        MockDataStore.ResetForTests();

        MockDataStore.Accounts.Count.Should().Be(3);
        MockDataStore.Users.Count.Should().Be(4);
        MockDataStore.Posts.Count.Should().Be(2);
        MockDataStore.UserRelations.Should().BeEmpty();
        MockDataStore.Notifications.Should().BeEmpty();
        MockDataStore.Messages.Should().BeEmpty();
        MockDataStore.Accounts.Values.Should().OnlyContain(a => a.RefreshTokens.All(t => !t.IsActive));
        MockDataStore.Users[SeedIds.DemoUser].FollowersCount.Should().Be(0);
    }

    [Fact]
    public async Task Reset_RepositoriesSeeSameCollections()
    {
        MockDataStore.ResetForTests();

        // Write through DI repo (holds the static reference) -> visible in store
        using var scope = Factory.Services.CreateScope();
        var posts = scope.ServiceProvider.GetRequiredService<YSocial.Domain.Posts.IPostRepository>();
        var post = YSocial.Domain.Posts.Post.Create(SeedIds.TestUser, "via repo");
        await posts.AddAsync(post);

        MockDataStore.Posts.Should().ContainKey(post.Id);
    }

    [Fact]
    public void Seed_IdsStableAcrossResets()
    {
        MockDataStore.ResetForTests();
        var first = MockDataStore.Users.Values.Select(u => (u.Id.Value, u.CreatedAt)).OrderBy(x => x.Value).ToList();

        MockDataStore.ResetForTests();
        var second = MockDataStore.Users.Values.Select(u => (u.Id.Value, u.CreatedAt)).OrderBy(x => x.Value).ToList();

        second.Should().Equal(first);
        MockDataStore.Posts.Should().ContainKey(SeedIds.TestPost);
        MockDataStore.Accounts.Should().ContainKey(SeedIds.TestAccount);
    }
}
