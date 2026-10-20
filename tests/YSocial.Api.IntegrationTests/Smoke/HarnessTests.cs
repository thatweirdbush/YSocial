using System.Net;
using System.Net.Http.Json;
using FluentAssertions;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Posts;
using YSocial.Infrastructure.Persistence;
using YSocial.Infrastructure.Persistence.Seeding;
using YSocial.TestSupport;

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

        Store.Posts.Count.Should().BeGreaterThan(2);
        Store.Accounts[SeedIds.TestAccount].RefreshTokens.Should().NotBeEmpty();

        Store.Reset();

        Store.Accounts.Count.Should().Be(3);
        Store.Users.Count.Should().Be(4);
        Store.Posts.Count.Should().Be(2);
        Store.UserRelations.Should().BeEmpty();
        Store.Notifications.Should().BeEmpty();
        Store.Messages.Should().BeEmpty();
        Store.Accounts.Values.Should().OnlyContain(a => a.RefreshTokens.All(t => !t.IsActive));
        Store.Users[SeedIds.DemoUser].FollowersCount.Should().Be(0);
    }

    [Fact]
    public async Task Repository_WriteThroughUnitOfWork_IsPersisted()
    {
        using var scope = Factory.Services.CreateScope();
        var posts = scope.ServiceProvider.GetRequiredService<IPostRepository>();
        var post = Post.Create(SeedIds.TestUser, "via repo");
        await posts.AddAsync(post);

        Store.Posts.ContainsKey(post.Id).Should().BeFalse("nothing is saved before the unit of work commits");

        await scope.ServiceProvider.GetRequiredService<IUnitOfWork>().CommitAsync();

        Store.Posts.ContainsKey(post.Id).Should().BeTrue();
    }

    [Fact]
    public void Seed_IdsStableAcrossResets()
    {
        Store.Reset();
        var first = Store.Users.Values.Select(u => (u.Id.Value, u.CreatedAt)).OrderBy(x => x.Value).ToList();

        Store.Reset();
        var second = Store.Users.Values.Select(u => (u.Id.Value, u.CreatedAt)).OrderBy(x => x.Value).ToList();

        second.Should().Equal(first);
        Store.Posts.ContainsKey(SeedIds.TestPost).Should().BeTrue();
        Store.Accounts.ContainsKey(SeedIds.TestAccount).Should().BeTrue();
    }

    [Fact]
    public void Host_UsesTheSqliteTestDatabase_NeverPostgres()
    {
        using var scope = Factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<YSocialDbContext>();

        db.Database.IsSqlite().Should().BeTrue("tests must never reach the configured Postgres database");
    }
}
