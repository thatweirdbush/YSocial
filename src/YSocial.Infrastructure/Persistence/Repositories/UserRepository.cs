using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.UnitOfWorks;
using Microsoft.EntityFrameworkCore;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Persistence.Repositories;

internal sealed class UserRepository(YSocialDbContext db, IUnitOfWork unitOfWork)
    : RepositoryBase<User, UserId>(db, unitOfWork), IUserRepository
{
    public async Task<IReadOnlyList<User>> GetByAccountIdAsync(AccountId accountId, CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted().Where(u => u.AccountId == accountId).ToListAsync(cancellationToken);

    public async Task<User?> GetByIdAndAccountIdAsync(UserId id, AccountId accountId, CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted().FirstOrDefaultAsync(u => u.Id == id && u.AccountId == accountId, cancellationToken);

    public async Task<User?> GetByUsernameAsync(string username, CancellationToken cancellationToken = default)
    {
        var normalized = username.ToLower();
        return await Set.WhereNotDeleted().FirstOrDefaultAsync(u => u.Username.ToLower() == normalized, cancellationToken);
    }

    public async Task<IReadOnlyList<User>> GetAllActiveAsync(CancellationToken cancellationToken = default)
        => await Set.WhereNotDeleted().ToListAsync(cancellationToken);

    public async Task<IReadOnlyList<User>> GetUsersByIdsAsync(IEnumerable<UserId> ids, CancellationToken cancellationToken = default)
    {
        var wanted = ids.Distinct().ToList();
        return await Set.WhereNotDeleted().Where(u => wanted.Contains(u.Id)).ToListAsync(cancellationToken);
    }

    // Emails stay reserved after account deletion
    public async Task<bool> IsEmailUniqueAsync(string email, CancellationToken cancellationToken = default)
    {
        var normalized = email.ToLower();
        return !await Db.Accounts.AnyAsync(a => a.Email.ToLower() == normalized, cancellationToken);
    }

    // Usernames are never recycled: soft-deleted profiles count
    public async Task<bool> IsUsernameTakenAsync(string username, CancellationToken cancellationToken = default)
    {
        var normalized = username.ToLower();
        return await Set.AnyAsync(u => u.Username.ToLower() == normalized, cancellationToken);
    }
}
