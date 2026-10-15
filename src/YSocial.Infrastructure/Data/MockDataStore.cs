using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using System.Collections.Concurrent;
using YSocial.Domain.Comments;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data.Seed;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure.Data;

public class MockDataStore : DbContext, IDataStorage, IDomainEventsProvider
{
    public static ConcurrentDictionary<AccountId, Account> Accounts { get; } = [];
    public static ConcurrentDictionary<UserId, User> Users { get; } = [];
    public static ConcurrentDictionary<UserRelationId, UserRelation> UserRelations { get; } = [];
    public static ConcurrentDictionary<UserBlockId, UserBlock> UserBlocks { get; } = [];
    public static ConcurrentDictionary<PostId, Post> Posts { get; } = [];
    public static ConcurrentDictionary<LikeId, Like> Likes { get; } = [];
    public static ConcurrentDictionary<CommentId, Comment> Comments { get; } = [];
    public static ConcurrentDictionary<SavedItemId, SavedItem> SavedItems { get; } = [];
    public static ConcurrentDictionary<NotificationId, Notification> Notifications { get; } = [];
    public static List<NotificationOutboxMessage> Messages { get; } = [];

    static MockDataStore()
    {
        SeedMockData();
    }

    private static void SeedMockData() => MockSeeder.Seed();

    /// <summary>
    /// Clears every static collection IN PLACE (repos hold references) & reseeds. Test use only.
    /// </summary>
    public static void ResetForTests()
    {
        Accounts.Clear();
        Users.Clear();
        UserRelations.Clear();
        UserBlocks.Clear();
        Posts.Clear();
        Likes.Clear();
        Comments.Clear();
        SavedItems.Clear();
        Notifications.Clear();
        Messages.Clear();

        SeedMockData();
    }

    public void ClearAllDomainEvents()
    {
        foreach (var entry in Accounts.Values) entry.ClearDomainEvents();
        foreach (var entry in Users.Values) entry.ClearDomainEvents();
        foreach (var entry in Posts.Values) entry.ClearDomainEvents();
        foreach (var entry in Likes.Values) entry.ClearDomainEvents();
        foreach (var entry in Comments.Values) entry.ClearDomainEvents();
        foreach (var entry in SavedItems.Values) entry.ClearDomainEvents();
    }

    public IReadOnlyCollection<IDomainEvent> GetAllDomainEvents()
    {
        var events = new List<IDomainEvent>();

        events.AddRange(Accounts.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Users.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Posts.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Likes.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(Comments.Values.SelectMany(e => e.DomainEvents));
        events.AddRange(SavedItems.Values.SelectMany(e => e.DomainEvents));

        return events.AsReadOnly();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(1);
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        modelBuilder.ApplyConfigurationsFromAssembly(typeof(MockDataStore).Assembly);

        // Force all DateTime values retrieved from the database to be UTC
        foreach (var entityType in modelBuilder.Model.GetEntityTypes())
        {
            var dateTimeProperties = entityType.GetProperties()
                .Where(p => p.ClrType == typeof(DateTime) || p.ClrType == typeof(DateTime?));

            foreach (var property in dateTimeProperties)
            {
                property.SetValueConverter(new ValueConverter<DateTime, DateTime>(
                    v => v.ToUniversalTime(),
                    v => DateTime.SpecifyKind(v, DateTimeKind.Utc)));
            }
        }
    }
}
