using Microservice.BuildingBlocks.Domain.AggregateRoots;
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
using YSocial.Application.Abstractions.Persistence;
using YSocial.Infrastructure.Data.Seed;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure.Data;

public class MockDataStore : DbContext, IDataStorage, IDomainEventsProvider, IPendingDomainEvents
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
        RemovedAggregateEvents.Clear();

        SeedMockData();
    }

    #region Domain events

    /// <summary>
    /// Events of hard-removed aggregates (Like, UserBlock, Notification): they are no longer scanned, so they wait here.
    /// </summary>
    public static ConcurrentQueue<IDomainEvent> RemovedAggregateEvents { get; } = [];

    private static readonly object EventsLock = new();

    /// <summary>
    /// Moves pending events of an aggregate that is about to be hard-removed into <see cref="RemovedAggregateEvents"/>.
    /// </summary>
    public static void CaptureRemovedEvents<TId>(AggregateRoot<TId> aggregate)
    {
        lock (EventsLock)
        {
            foreach (var domainEvent in aggregate.DomainEvents)
            {
                RemovedAggregateEvents.Enqueue(domainEvent);
            }

            aggregate.ClearDomainEvents();
        }
    }

    /// <summary>
    /// Process-global: a concurrent request can take or discard events raised by another request (lock only guards the snapshot).
    /// </summary>
    public IReadOnlyCollection<IDomainEvent> DrainDomainEvents()
    {
        lock (EventsLock)
        {
            var events = new List<IDomainEvent>();

            while (RemovedAggregateEvents.TryDequeue(out var removed)) events.Add(removed);

            Collect(Accounts.Values, events);
            Collect(Users.Values, events);
            Collect(UserRelations.Values, events);
            Collect(UserBlocks.Values, events);
            Collect(Posts.Values, events);
            Collect(Likes.Values, events);
            Collect(Comments.Values, events);
            Collect(SavedItems.Values, events);
            Collect(Notifications.Values, events);

            return events.OrderBy(e => e.OccurredOn).ToList().AsReadOnly();
        }
    }

    /// <inheritdoc/>
    public IReadOnlyCollection<IDomainEvent> Discard() => DrainDomainEvents();

    private static void Collect<TId>(IEnumerable<AggregateRoot<TId>> aggregates, List<IDomainEvent> into)
    {
        foreach (var aggregate in aggregates)
        {
            if (aggregate.DomainEvents.Count == 0) continue;

            into.AddRange(aggregate.DomainEvents);
            aggregate.ClearDomainEvents();
        }
    }

    #endregion

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
