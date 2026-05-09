using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Data;

/// <summary>
/// In-memory implementation of IUserRepository for mocking and rapid development.
/// </summary>
public class MockUserRepository : IUserRepository
{
    private readonly ConcurrentDictionary<UserId, User> _users = MockDataStore.Users;

    public IUnitOfWork UnitOfWork => null!;

    public Task<User?> GetByIdAsync(UserId id, CancellationToken cancellationToken = default)
    {
        _users.TryGetValue(id, out var user);

        if (user != null && user.IsDeleted)
            return Task.FromResult<User?>(null);

        return Task.FromResult(user);
    }

    public Task AddAsync(User user, CancellationToken cancellationToken = default)
    {
        _users.TryAdd(user.Id, user);
        return Task.CompletedTask;
    }

    public void Update(User user)
    {
        _users.AddOrUpdate(user.Id, user, (_, _) => user);
    }

    public void Remove(User user)
    {
        _users[user.Id] = user;
    }

    // Mock simply returns true assuming uniqueness is preserved or we aren't maintaining identity mappings in mock layer
    public Task<bool> IsEmailUniqueAsync(string email)
    {
        return Task.FromResult(true);
    }
}
