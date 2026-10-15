using FluentAssertions;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.Extensions.DependencyInjection;
using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Xunit;
using YSocial.Api.IntegrationTests.Infrastructure;
using YSocial.Domain.Notifications;
using YSocial.Domain.UserRelations;
using YSocial.Infrastructure.Data;
using YSocial.Infrastructure.Data.Seed;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;

namespace YSocial.Api.IntegrationTests.Events;

public class EventDispatchTests(ApiFixture fixture) : ApiTestBase(fixture)
{
    private static string Follow(Guid target) => $"/api/users/{target}/relations/follow";

    private static string Block(Guid target) => $"/api/users/{target}/blocks";

    private static object PostLike(Guid id) => new { targetId = id, targetType = 1 };

    private IReadOnlyCollection<IDomainEvent> DrainPending()
    {
        using var scope = Factory.Services.CreateScope();
        return scope.ServiceProvider.GetRequiredService<IDomainEventsProvider>().DrainDomainEvents();
    }

    private static (int Followers, int Following) Counts(Domain.Users.UserId id)
        => (MockDataStore.Users[id].FollowersCount, MockDataStore.Users[id].FollowingCount);

    [Fact]
    public async Task FollowPublicUser_IncrementsCounts()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();

        Counts(SeedIds.DemoUser).Followers.Should().Be(1);
        Counts(SeedIds.TestUser).Following.Should().Be(1);
    }

    [Fact]
    public async Task FollowPublicUserTwice_CountsIncrementOnce()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();
        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();

        Counts(SeedIds.DemoUser).Followers.Should().Be(1);
        Counts(SeedIds.TestUser).Following.Should().Be(1);
    }

    [Fact]
    public async Task Unfollow_DecrementsCounts()
    {
        var test = await LoginAsync(Seed.TestLogin);
        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();

        (await test.DeleteAsync(Follow(SeedIds.DemoUser.Value))).EnsureSuccessStatusCode();

        Counts(SeedIds.DemoUser).Followers.Should().Be(0);
        Counts(SeedIds.TestUser).Following.Should().Be(0);
    }

    [Fact]
    public async Task Unlike_DecrementsPostLikeCount()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PostAsJsonAsync("/api/likes/toggle", PostLike(SeedIds.DemoPost.Value))).EnsureSuccessStatusCode();
        MockDataStore.Posts[SeedIds.DemoPost].LikeCount.Should().Be(1);

        (await test.PostAsJsonAsync("/api/likes/toggle", PostLike(SeedIds.DemoPost.Value))).EnsureSuccessStatusCode();

        MockDataStore.Posts[SeedIds.DemoPost].LikeCount.Should().Be(0);
    }

    [Fact]
    public async Task UnlikeComment_DecrementsCommentLikeCount()
    {
        var demo = await LoginAsync(Seed.DemoLogin);
        var test = await LoginAsync(Seed.TestLogin);
        var add = await demo.PostAsJsonAsync("/api/comments", new { postId = SeedIds.DemoPost.Value, content = "hi", parentCommentId = (Guid?)null });
        add.EnsureSuccessStatusCode();
        var commentId = JsonDocument.Parse(await add.Content.ReadAsStringAsync()).RootElement.GetGuid();
        var body = new { targetId = commentId, targetType = 2 };

        (await test.PostAsJsonAsync("/api/likes/toggle", body)).EnsureSuccessStatusCode();
        MockDataStore.Comments.Values.Single().LikeCount.Should().Be(1);

        (await test.PostAsJsonAsync("/api/likes/toggle", body)).EnsureSuccessStatusCode();

        MockDataStore.Comments.Values.Single().LikeCount.Should().Be(0);
    }

    [Fact]
    public async Task Block_RemovesFollowsBothDirections_CountsInSameRequest()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();
        (await demo.PostAsync(Follow(SeedIds.TestUser.Value), null)).EnsureSuccessStatusCode();
        Counts(SeedIds.TestUser).Should().Be((1, 1));

        (await test.PostAsync(Block(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();

        MockDataStore.UserRelations.Values.Should().OnlyContain(r => r.IsDeleted);
        Counts(SeedIds.TestUser).Should().Be((0, 0));
        Counts(SeedIds.DemoUser).Should().Be((0, 0));
    }

    [Fact]
    public async Task Unblock_LeavesNoPendingEvents()
    {
        var test = await LoginAsync(Seed.TestLogin);
        (await test.PostAsync(Block(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();

        (await test.DeleteAsync(Block(SeedIds.DemoUser.Value))).EnsureSuccessStatusCode();

        MockDataStore.UserBlocks.Should().BeEmpty();
        DrainPending().Should().BeEmpty();
    }

    [Fact]
    public async Task FollowPublicUser_CreatesFollowAcceptedNotification()
    {
        var test = await LoginAsync(Seed.TestLogin);

        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();

        var notification = MockDataStore.Notifications.Values.Should().ContainSingle().Subject;
        notification.RecipientId.Should().Be(SeedIds.DemoUser);
        notification.Type.Should().Be(NotificationType.FollowAccepted);
    }

    [Fact]
    public async Task DeletePost_SoftRemovesSavedItems_InSameRequest()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);
        (await test.PostAsJsonAsync("/api/saveditems/toggle", new { targetId = SeedIds.DemoPost.Value, targetType = 1 })).EnsureSuccessStatusCode();
        MockDataStore.SavedItems.Values.Should().ContainSingle().Which.IsDeleted.Should().BeFalse();

        (await demo.DeleteAsync($"/api/posts/{SeedIds.DemoPost.Value}")).EnsureSuccessStatusCode();

        MockDataStore.SavedItems.Values.Should().ContainSingle().Which.IsDeleted.Should().BeTrue();
        DrainPending().Should().BeEmpty();
    }

    [Theory]
    [InlineData(true, HttpStatusCode.InternalServerError)]
    [InlineData(false, HttpStatusCode.BadRequest)]
    public async Task FailedCommand_DoesNotLeakEventsIntoNextRequest(bool throwException, HttpStatusCode expected)
    {
        var response = await Client.PostAsync($"/api/testprobe/fail-after-event/{throwException.ToString().ToLowerInvariant()}", null);

        response.StatusCode.Should().Be(expected);
        MockDataStore.Posts[SeedIds.TestPost].DomainEvents.Should().BeEmpty("failed requests must discard pending events");

        // Next unrelated command must not dispatch the leaked event
        var test = await LoginAsync(Seed.TestLogin);
        (await test.PostAsync(Follow(SeedIds.DemoUser.Value), null)).EnsureSuccessStatusCode();
        DrainPending().Should().BeEmpty();
    }

    [Fact]
    public async Task Provider_EmptyAfterEveryRequest()
    {
        var test = await LoginAsync(Seed.TestLogin);
        var demo = await LoginAsync(Seed.DemoLogin);

        foreach (var request in new Func<Task<HttpResponseMessage>>[]
                 {
                     () => test.PostAsync(Follow(SeedIds.DemoUser.Value), null),
                     () => demo.PostAsync(Follow(SeedIds.TestUser.Value), null),
                     () => test.PostAsJsonAsync("/api/likes/toggle", PostLike(SeedIds.DemoPost.Value)),
                     () => test.PostAsJsonAsync("/api/likes/toggle", PostLike(SeedIds.DemoPost.Value)),
                     () => test.PostAsync(Block(SeedIds.DemoUser.Value), null),
                     () => test.DeleteAsync(Block(SeedIds.DemoUser.Value)),
                     () => test.DeleteAsync($"/api/posts/{SeedIds.TestPost.Value}")
                 })
        {
            (await request()).EnsureSuccessStatusCode();
            DrainPending().Should().BeEmpty();
        }
    }
}
