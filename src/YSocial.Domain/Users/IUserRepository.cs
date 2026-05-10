using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Identities;

namespace YSocial.Domain.Users;
public interface IUserRepository : IRepository<User, UserId>
{
    Task<bool> IsEmailUniqueAsync(string email);
    Task<IReadOnlyList<User>> GetByAccountIdAsync(AccountId accountId, CancellationToken cancellationToken = default);
}
