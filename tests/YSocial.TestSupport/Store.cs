using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microsoft.EntityFrameworkCore;
using System.Collections;
using YSocial.Domain.Comments;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Notifications.Outbox;

namespace YSocial.TestSupport;

/// <summary>
/// Direct database access of tests (arrange & assert) through the current <see cref="SqliteTestDatabase"/>.
/// Reads are fresh snapshots (own context per call); writes save immediately WITHOUT dispatching domain events
/// (no counters, no notifications), so arranged state is exactly what the test says.
/// </summary>
public static class Store
{
    private static SqliteTestDatabase? _database;

    /// <summary>
    /// Points the facade at the database of the running test host (tests of 1 collection run sequentially).
    /// </summary>
    public static void Use(SqliteTestDatabase database) => _database = database;

    /// <summary>
    /// Empties the database & seeds the core baseline again.
    /// </summary>
    public static void Reset() => Database.Reset();

    public static SqliteTestDatabase Database => _database ?? throw new InvalidOperationException("Store.Use(database) was not called.");

    public static StoreSet<Account, AccountId> Accounts { get; } = [];
    public static StoreSet<User, UserId> Users { get; } = [];
    public static StoreSet<Post, PostId> Posts { get; } = [];
    public static StoreSet<Comment, CommentId> Comments { get; } = [];
    public static StoreSet<Like, LikeId> Likes { get; } = [];
    public static StoreSet<SavedItem, SavedItemId> SavedItems { get; } = [];
    public static StoreSet<UserRelation, UserRelationId> UserRelations { get; } = [];
    public static StoreSet<UserBlock, UserBlockId> UserBlocks { get; } = [];
    public static StoreSet<Notification, NotificationId> Notifications { get; } = [];

    /// <summary>
    /// Undelivered outbox messages, oldest first.
    /// </summary>
    public static IReadOnlyList<NotificationOutboxMessage> Messages
    {
        get
        {
            using var db = Database.NewContext();
            return db.NotificationOutboxMessages.AsNoTracking().ToList().OrderBy(m => m.OccurredOnUtc).ToList();
        }
    }
}

/// <summary>
/// Dictionary-like view of 1 aggregate table.
/// </summary>
public sealed class StoreSet<T, TId> : IEnumerable<T>
    where T : class, IAggregateRoot
    where TId : notnull
{
    /// <summary>
    /// Snapshot of the aggregate (throws when absent).
    /// </summary>
    public T this[TId id] => Values.First(e => Matches(e, id));

    public IReadOnlyList<T> Values
    {
        get
        {
            using var db = Store.Database.NewContext();
            return db.Set<T>().AsNoTracking().ToList();
        }
    }

    public IReadOnlyList<TId> Keys => Values.Select(e => (TId)e.Id).ToList();

    public int Count => Values.Count;

    public bool ContainsKey(TId id) => Values.Any(e => Matches(e, id));

    public bool TryAdd(TId id, T entity)
    {
        Add(entity);
        return true;
    }

    public void Add(T entity)
    {
        using var db = Store.Database.NewContext();
        db.Set<T>().Add(entity);
        db.SaveChanges();
    }

    /// <summary>
    /// Loads the aggregate, applies the change & saves (no events dispatched).
    /// </summary>
    public void Update(TId id, Action<T> change)
    {
        using var db = Store.Database.NewContext();
        var entity = db.Set<T>().ToList().First(e => Matches(e, id));

        change(entity);
        db.SaveChanges();
    }

    /// <summary>
    /// <see cref="Update"/> of the only aggregate in the table.
    /// </summary>
    public void UpdateSingle(Action<T> change)
    {
        using var db = Store.Database.NewContext();
        change(db.Set<T>().ToList().Single());
        db.SaveChanges();
    }

    public IEnumerator<T> GetEnumerator() => Values.GetEnumerator();

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();

    private static bool Matches(T entity, TId id) => entity.Id.Equals(id);
}
