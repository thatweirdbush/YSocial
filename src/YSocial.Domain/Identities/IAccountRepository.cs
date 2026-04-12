using Microservice.BuildingBlocks.Domain.Repositories;

namespace YSocial.Domain.Identities;

/// <summary>
/// Repository interface for Account aggregate root.
/// </summary>
public interface IAccountRepository : IRepository<Account, AccountId>
{
    Task<Account?> GetByEmailAsync(string email, CancellationToken cancellationToken = default);
}
