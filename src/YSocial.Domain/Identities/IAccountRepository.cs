using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.Identities;

/// <summary>
/// Repository interface for Account aggregate root.
/// </summary>
public interface IAccountRepository : IRepository<Account, AccountId>
{
    Task<Account?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<Account?> GetByPhoneNumberAsync(string phoneNumber, CancellationToken cancellationToken = default);
    Task<Account?> GetByIdentifierAsync(string loginId, CancellationToken cancellationToken = default);
    Task<AccountId?> GetIdByIdentifierAsync(string loginId, CancellationToken cancellationToken = default);
    Task<Account?> GetByRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default);
    Task<(Account? Account, IReadOnlyList<User> Profiles)> GetAccountWithProfilesByIdentifierAsync(string loginId, CancellationToken cancellationToken = default);
}
