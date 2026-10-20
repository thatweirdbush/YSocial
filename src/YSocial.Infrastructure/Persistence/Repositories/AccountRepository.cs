using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class AccountRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<Account, AccountId>(db, unitOfWork), IAccountRepository
{
    // FindAsync ignores auto-included children (tokens): query instead
    public override async Task<Account?> GetByIdAsync(AccountId id, bool includeDeleted, CancellationToken cancellationToken = default)
    {
        var account = await Set.FirstOrDefaultAsync(a => a.Id == id, cancellationToken);

        return account is { IsDeleted: true } && !includeDeleted ? null : account;
    }

    public Task<Account?> GetByEmailAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = email.ToLower();
        return Active().FirstOrDefaultAsync(a => a.Email.ToLower() == normalized, cancellationToken);
    }

    public Task<Account?> GetByPhoneNumberAsync(string phoneNumber, CancellationToken cancellationToken = default)
        => Active().FirstOrDefaultAsync(a => a.PhoneNumber == phoneNumber, cancellationToken);

    public Task<Account?> GetByIdentifierAsync(string loginId, CancellationToken cancellationToken = default)
        => FindByIdentifier(Active(), loginId).FirstOrDefaultAsync(cancellationToken);

    public async Task<AccountId?> GetIdByIdentifierAsync(string loginId, CancellationToken cancellationToken = default)
    {
        var id = await FindByIdentifier(Db.Accounts.AsNoTracking().WhereNotDeleted(), loginId)
            .Select(a => (AccountId?)a.Id)
            .FirstOrDefaultAsync(cancellationToken);

        return id;
    }

    public Task<Account?> GetByRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default)
        => Db.Accounts.AsNoTracking()
            .FirstOrDefaultAsync(a => a.RefreshTokens.Any(t => t.Token == refreshToken), cancellationToken);

    public async Task<(Account? Account, IReadOnlyList<User> Profiles)> GetAccountWithProfilesByIdentifierAsync(string loginId, CancellationToken cancellationToken = default)
    {
        var account = await FindByIdentifier(Db.Accounts.AsNoTracking().WhereNotDeleted(), loginId).FirstOrDefaultAsync(cancellationToken);
        if (account is null)
        {
            return (null, []);
        }

        var profiles = await Db.Users.AsNoTracking()
            .WhereNotDeleted()
            .Where(u => u.AccountId == account.Id)
            .ToListAsync(cancellationToken);

        return (account, profiles);
    }

    private IQueryable<Account> Active() => Set.WhereNotDeleted();

    /// <summary>
    /// Login id heuristics: contains '@' = email, leading '+' or digits/space/dash = phone, else username.
    /// </summary>
    private IQueryable<Account> FindByIdentifier(IQueryable<Account> accounts, string loginId)
    {
        if (loginId.Contains('@'))
        {
            var email = loginId.ToLower();
            return accounts.Where(a => a.Email.ToLower() == email);
        }

        if (loginId.StartsWith('+') || loginId.All(c => char.IsDigit(c) || c == '-' || c == ' '))
        {
            return accounts.Where(a => a.PhoneNumber == loginId);
        }

        var username = loginId.ToLower();
        return accounts.Where(a => Db.Users.Any(u => u.AccountId == a.Id && !u.IsDeleted && u.Username.ToLower() == username));
    }
}
