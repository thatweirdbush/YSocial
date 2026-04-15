using Microservice.BuildingBlocks.Domain.Events;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Posts;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Messaging.DomainEventsDispatching;
using YSocial.Infrastructure.Persistence.UnitOfWork;

namespace YSocial.Infrastructure.Data;
public class MockDataStore : DbContext, IPostRepository, IDataStorage, IDomainEventsProvider
{
    public static List<Post> Posts { get; set; } =
    [
        Post.Create(UserId.New(), "Welcome to YSocial!"),
        Post.Create(UserId.New(), "Today's weather is nice."),
    ];

    public IUnitOfWork UnitOfWork => throw new NotImplementedException();

    public Task AddAsync(Post post)
    {
        return Task.CompletedTask;
    }

    public Task<List<Post>> GetByAuthorIdAsync(UserId authorId)
    {
        return Task.FromResult(Posts.Where(p => p.AuthorId == authorId).ToList());
    }

    public Task<Post?> GetByIdAsync(PostId id, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(Posts.FirstOrDefault(p => p.Id == id));
    }

    public void ClearAllDomainEvents()
    {
        //foreach (var entry in ChangeTracker.Entries<AggregateRoot>())
        foreach (var entry in Posts)
        {
            //entry.Entity.ClearDomainEvents();
            entry.ClearDomainEvents();
        }
    }

    public IReadOnlyCollection<IDomainEvent> GetAllDomainEvents()
    {
        //return ChangeTracker.Entries<AggregateRoot>()
        //	.Select(e => e.Entity)
        //	.SelectMany(e => e.DomainEvents)
        //	.ToList()
        //	.AsReadOnly();
        return Posts
            .SelectMany(e => e.DomainEvents)
            .ToList()
            .AsReadOnly();
    }

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(0);
    }

    public Task AddAsync(Post aggregate, CancellationToken cancellationToken = default)
    {
        throw new NotImplementedException();
    }

    public void Update(Post aggregate)
    {
        throw new NotImplementedException();
    }

    public void Remove(Post aggregate)
    {
        throw new NotImplementedException();
    }
}