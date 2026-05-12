using Microservice.BuildingBlocks.Domain.Repositories;

namespace YSocial.Domain.Identities;

/// <summary>
/// Repository interface for Account aggregate root.
/// </summary>
public interface IAccountRepository : IRepository<Account, AccountId>
{
    Task<Account?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);
    Task<Account?> GetByPhoneNumberAsync(string phoneNumber, CancellationToken cancellationToken = default);
    Task<(Account? Account, IReadOnlyList<YSocial.Domain.Users.User> Profiles)> GetAccountWithProfilesByIdentifierAsync(string loginId, CancellationToken cancellationToken = default);
}
