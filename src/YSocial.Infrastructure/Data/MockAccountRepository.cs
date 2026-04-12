using System.Collections.Concurrent;
using YSocial.Domain.Identities;

namespace YSocial.Infrastructure.Data;

/// <summary>
/// In-memory implementation of IAccountRepository for mocking and rapid development.
/// </summary>
public class MockAccountRepository : IAccountRepository
{
    private readonly ConcurrentDictionary<AccountId, Account> _accounts = new();

    public Microservice.BuildingBlocks.Domain.UnitOfWorks.IUnitOfWork UnitOfWork => null!;

    public Task<Account?> GetByIdAsync(AccountId id, CancellationToken cancellationToken = default)
    {
        _accounts.TryGetValue(id, out var account);
        return Task.FromResult(account);
    }

    public Task<Account?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var account = _accounts.Values.FirstOrDefault(a => a.Email.Equals(email, StringComparison.OrdinalIgnoreCase));
        return Task.FromResult(account);
    }

    public Task AddAsync(Account account, CancellationToken cancellationToken = default)
    {
        _accounts.TryAdd(account.Id, account);
        return Task.CompletedTask;
    }

    public void Update(Account account)
    {
        _accounts.AddOrUpdate(account.Id, account, (_, _) => account);
    }

    public void Remove(Account account)
    {
        _accounts.TryRemove(account.Id, out _);
    }
}
