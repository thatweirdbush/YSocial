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

    public void ClearAllDomainEvents()
    {
        foreach (var entry in ChangeTracker.Entries<AggregateRoot>())
        {
            entry.Entity.ClearDomainEvents();
        }
    }

    public IReadOnlyCollection<IDomainEvent> GetAllDomainEvents()
    {
        return ChangeTracker.Entries<AggregateRoot>()
            .Select(e => e.Entity)
            .SelectMany(e => e.DomainEvents)
            .ToList()
            .AsReadOnly();
    }
}
