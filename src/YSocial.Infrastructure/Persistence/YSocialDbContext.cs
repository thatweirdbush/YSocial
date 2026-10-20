using System.Collections.Concurrent;
using System.Reflection;
using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.Enumerations;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using YSocial.Application.Abstractions.Persistence;
using YSocial.Domain.Comments;
using YSocial.Domain.Identities;
using YSocial.Domain.Likes;
using YSocial.Domain.Notifications;
using YSocial.Domain.Posts;
using YSocial.Domain.SavedItems;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Notifications.Outbox;
using YSocial.Infrastructure.Persistence.Conversions;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure.Persistence;

/// <summary>
/// Single EF Core model of the app (Npgsql in production, SQLite in tests: keep it provider-neutral).
/// Doubles as the per-request change tracker: pending domain events are read from tracked aggregates.
/// </summary>
public class YSocialDbContext(DbContextOptions<YSocialDbContext> options)
    : DbContext(options), IDataStorage, IDomainEventsProvider, IPendingDomainEvents
{
    #region Sets

    public DbSet<Account> Accounts => Set<Account>();
    public DbSet<User> Users => Set<User>();
    public DbSet<Post> Posts => Set<Post>();
    public DbSet<Comment> Comments => Set<Comment>();
    public DbSet<Like> Likes => Set<Like>();
    public DbSet<SavedItem> SavedItems => Set<SavedItem>();
    public DbSet<UserRelation> UserRelations => Set<UserRelation>();
    public DbSet<UserBlock> UserBlocks => Set<UserBlock>();
    public DbSet<Notification> Notifications => Set<Notification>();
    public DbSet<NotificationOutboxMessage> NotificationOutboxMessages => Set<NotificationOutboxMessage>();

    #endregion

    #region Model

    /// <summary>
    /// Shadow concurrency token of <see cref="Account"/> (bumped when the account or its tokens change).
    /// </summary>
    internal const string AccountVersion = "Version";

    private static readonly Type[] DomainTypes = typeof(Account).Assembly.GetTypes();

    protected override void ConfigureConventions(ModelConfigurationBuilder configurationBuilder)
    {
        configurationBuilder.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
        configurationBuilder.Properties<DateTime?>().HaveConversion<UtcDateTimeConverter>();

        foreach (var idType in DomainTypes.Where(IsStronglyTypedId))
        {
            configurationBuilder.Properties(idType)
                .HaveConversion(typeof(StronglyTypedIdConverter<>).MakeGenericType(idType));
        }

        foreach (var enumeration in DomainTypes.Where(IsIntEnumeration))
        {
            configurationBuilder.Properties(enumeration)
                .HaveConversion(typeof(EnumerationConverter<>).MakeGenericType(enumeration));
        }
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(YSocialDbContext).Assembly);

        foreach (var entityType in modelBuilder.Model.GetEntityTypes().Where(e => IsEntity(e.ClrType)))
        {
            var entity = modelBuilder.Entity(entityType.ClrType);
            entity.HasKey(nameof(IEntity.Id));
            entity.Property(nameof(IEntity.Id)).ValueGeneratedNever();

            if (IsAggregateRoot(entityType.ClrType))
            {
                entity.Ignore(nameof(AggregateRoot<Guid>.DomainEvents));
            }
        }

        if (Database.IsNpgsql())
        {
            modelBuilder.Entity<NotificationOutboxMessage>().Property(m => m.Content).HasColumnType("jsonb");
        }
    }

    // Generated ids: the [StronglyTypedId] attribute is compiled away, so detect the shape (struct, Guid Value & (Guid) ctor)
    private static bool IsStronglyTypedId(Type type)
        => type is { IsValueType: true, IsPublic: true, IsEnum: false }
           && type.Name.EndsWith("Id", StringComparison.Ordinal)
           && type.GetConstructor([typeof(Guid)]) is not null
           && type.GetProperty("Value")?.PropertyType == typeof(Guid);

    // The enumeration type itself (direct Enumeration<Self> child), not its private nested variants
    private static bool IsIntEnumeration(Type type)
        => type is { IsGenericType: false, BaseType: { IsGenericType: true } baseType }
           && baseType.GetGenericTypeDefinition() == typeof(Enumeration<>)
           && baseType.GetGenericArguments()[0] == type
           && type.GetProperty("Value")?.PropertyType == typeof(int);

    private static bool IsEntity(Type type) => IsSubclassOfGeneric(type, typeof(Entity<>));

    private static bool IsAggregateRoot(Type type) => IsSubclassOfGeneric(type, typeof(AggregateRoot<>));

    private static bool IsSubclassOfGeneric(Type type, Type generic)
    {
        for (var current = type.BaseType; current is not null; current = current.BaseType)
        {
            if (current.IsGenericType && current.GetGenericTypeDefinition() == generic) return true;
        }

        return false;
    }

    #endregion

    #region Domain events

    private static readonly ConcurrentDictionary<Type, EventAccessor?> Accessors = new();

    /// <summary>
    /// Takes every event raised on tracked aggregates (any state, so hard-removed ones included), oldest first.
    /// </summary>
    public IReadOnlyCollection<IDomainEvent> DrainDomainEvents()
    {
        var events = new List<IDomainEvent>();

        foreach (var entry in ChangeTracker.Entries().Where(e => e.State != EntityState.Detached))
        {
            var accessor = Accessors.GetOrAdd(entry.Entity.GetType(), EventAccessor.TryCreate);
            if (accessor is null) continue;

            var raised = accessor.Read(entry.Entity);
            if (raised.Count == 0) continue;

            events.AddRange(raised);
            accessor.Clear(entry.Entity);
        }

        return events.OrderBy(e => e.OccurredOn).ToList().AsReadOnly();
    }

    /// <inheritdoc/>
    public IReadOnlyCollection<IDomainEvent> Discard() => DrainDomainEvents();

    private sealed record EventAccessor(PropertyInfo Events, MethodInfo ClearMethod)
    {
        public static EventAccessor? TryCreate(Type type)
        {
            var events = type.GetProperty(nameof(AggregateRoot<Guid>.DomainEvents));
            var clear = type.GetMethod(nameof(AggregateRoot<Guid>.ClearDomainEvents));

            return events is not null && clear is not null && IsAggregateRoot(type) ? new EventAccessor(events, clear) : null;
        }

        public IReadOnlyCollection<IDomainEvent> Read(object entity) => (IReadOnlyCollection<IDomainEvent>)Events.GetValue(entity)!;

        public void Clear(object entity) => ClearMethod.Invoke(entity, null);
    }

    #endregion

    #region Saving

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        BumpAccountVersions();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        BumpAccountVersions();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <summary>
    /// Optimistic concurrency for session state: any change of an account or its tokens bumps the account version,
    /// so a concurrent writer (other instance) fails with <see cref="DbUpdateConcurrencyException"/> instead of overwriting.
    /// </summary>
    private void BumpAccountVersions()
    {
        ChangeTracker.DetectChanges();

        var changedAccounts = ChangeTracker.Entries<Account>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified)
            .Select(e => e.Entity.Id)
            .ToHashSet();

        changedAccounts.UnionWith(ChangeTracker.Entries<RefreshToken>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .Select(e => e.Entity.AccountId));

        changedAccounts.UnionWith(ChangeTracker.Entries<PasswordResetToken>()
            .Where(e => e.State is EntityState.Added or EntityState.Modified or EntityState.Deleted)
            .Select(e => Entry(e.Entity).Property<AccountId>("AccountId").CurrentValue));

        foreach (var entry in ChangeTracker.Entries<Account>().Where(e => e.State != EntityState.Deleted && changedAccounts.Contains(e.Entity.Id)))
        {
            var version = entry.Property<int>(AccountVersion);
            version.CurrentValue += 1;
            version.IsModified = entry.State != EntityState.Added;
        }
    }

    #endregion
}
