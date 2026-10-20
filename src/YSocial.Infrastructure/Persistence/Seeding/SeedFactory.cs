using System.Reflection;
using Microservice.BuildingBlocks.Domain.AggregateRoots;
using YSocial.Domain.Identities;
using YSocial.Infrastructure.Identity;

namespace YSocial.Infrastructure.Persistence.Seeding;

/// <summary>
/// Pins ids & timestamps of seeded aggregates. Reflection on private setters is allowed ONLY here (seed data).
/// </summary>
internal static class SeedFactory
{
    // bcrypt is slow: hash once per process, low cost (seed data only)
    private const int SeedWorkFactor = 4;

    private static readonly Lazy<PasswordHash> TestHash = new(() => HashOf(SeedIds.TestPassword));
    private static readonly Lazy<PasswordHash> AdminHash = new(() => HashOf(SeedIds.AdminPassword));

    public static PasswordHash TestPasswordHash => TestHash.Value;

    public static PasswordHash AdminPasswordHash => AdminHash.Value;

    /// <summary>
    /// Sets <c>Id</c> & <c>CreatedAt</c>, drops the creation events (seed data is written directly, never dispatched).
    /// </summary>
    public static T Pin<T>(T entity, object id, DateTime createdAt) where T : class
    {
        var type = entity.GetType();

        type.GetProperty("Id", BindingFlags.Instance | BindingFlags.Public)!
            .GetSetMethod(true)!.Invoke(entity, [id]);

        type.GetProperty("CreatedAt", BindingFlags.Instance | BindingFlags.Public)!
            .GetSetMethod(true)!.Invoke(entity, [createdAt]);

        Clear(entity);
        return entity;
    }

    public static void Clear(object aggregate)
        => aggregate.GetType().GetMethod(nameof(AggregateRoot<Guid>.ClearDomainEvents))!.Invoke(aggregate, null);

    private static PasswordHash HashOf(string password)
        => PasswordHash.Create(new BCryptPasswordHasher(SeedWorkFactor).Hash(password));
}
