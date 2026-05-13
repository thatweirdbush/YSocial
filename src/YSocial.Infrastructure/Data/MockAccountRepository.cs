using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using System.Collections.Concurrent;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

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

    public Task<Account?> GetByPhoneNumberAsync(string phoneNumber, CancellationToken cancellationToken = default)
    {
        var account = _accounts.Values
            .WhereNotDeleted()
            .FirstOrDefault(a => a.PhoneNumber == phoneNumber);

        return Task.FromResult(account);
    }

    public Task<Account?> GetByIdentifierAsync(string loginId, CancellationToken cancellationToken = default)
    {
        Account? account = null;

        if (loginId.Contains('@'))
        {
            account = _accounts.Values
                .WhereNotDeleted()
                .FirstOrDefault(a => a.Email.Equals(loginId, StringComparison.OrdinalIgnoreCase));
        }
        else if (loginId.StartsWith('+') || loginId.All(c => char.IsDigit(c) || c == '-' || c == ' '))
        {
            account = _accounts.Values
                .WhereNotDeleted()
                .FirstOrDefault(a => a.PhoneNumber == loginId);
        }
        else
        {
            var targetUser = MockDataStore.Users.Values
                .WhereNotDeleted()
                .FirstOrDefault(u => u.Username.Equals(loginId, StringComparison.OrdinalIgnoreCase));

            if (targetUser is not null)
            {
                _accounts.TryGetValue(targetUser.AccountId, out account);
                if (account is not null && account.IsDeleted) account = null;
            }
        }

        return Task.FromResult(account);
    }

    public async Task<(Account? Account, IReadOnlyList<User> Profiles)> GetAccountWithProfilesByIdentifierAsync(string loginId, CancellationToken cancellationToken = default)
    {
        var account = await GetByIdentifierAsync(loginId, cancellationToken);

        List<User> profiles = null!;
        if (account is not null)
        {
            profiles = MockDataStore.Users.Values
                .WhereNotDeleted()
                .Where(u => u.AccountId == account.Id)
                .ToList();
        }
        else
        {
            profiles = [];
        }

        return (account, profiles);
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
