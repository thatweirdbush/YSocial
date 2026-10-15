using Microservice.BuildingBlocks.Domain.AggregateRoots;
using Microservice.BuildingBlocks.Domain.Events;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Posts;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure.Data;
public class YSocialDbContext : DbContext, IDataStorage, IDomainEventsProvider
{
    public YSocialDbContext(DbContextOptions<YSocialDbContext> options) : base(options) { }

    public DbSet<Post> Posts { get; set; }

    public IReadOnlyCollection<IDomainEvent> DrainDomainEvents()
    {
        var aggregates = ChangeTracker.Entries<AggregateRoot>().Select(e => e.Entity).ToList();
        var events = aggregates.SelectMany(e => e.DomainEvents).ToList();

        foreach (var aggregate in aggregates)
        {
            aggregate.ClearDomainEvents();
        }

        return events.AsReadOnly();
    }
}
