using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Identities;

namespace YSocial.Infrastructure.Data;

/// <summary>
/// In-memory implementation of IAccountRepository for mocking and rapid development.
/// </summary>
public class MockAccountRepository : IAccountRepository
{
    private readonly ConcurrentDictionary<AccountId, Account> _accounts = MockDataStore.Accounts;

    public IUnitOfWork UnitOfWork => null!;

    public Task<Account?> GetByIdAsync(AccountId id, CancellationToken cancellationToken = default)
        => GetByIdAsync(id, false, cancellationToken);

    public Task<Account?> GetByIdAsync(AccountId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        _accounts.TryGetValue(id, out var account);

        if (account != null && account.IsDeleted && !includeDeleted)
            return Task.FromResult<Account?>(null);

        return Task.FromResult(account);
    }

    public Task<Account?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var account = _accounts.Values
            .WhereNotDeleted()
            .FirstOrDefault(a => a.Email.Equals(email, StringComparison.OrdinalIgnoreCase));

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
        _accounts[account.Id] = account;
    }
}
