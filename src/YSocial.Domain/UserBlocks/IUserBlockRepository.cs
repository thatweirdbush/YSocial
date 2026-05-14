using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserBlocks;

public interface IUserBlockRepository : IRepository<UserBlock, UserBlockId>
{
    Task<bool> IsBlockedAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default);
    Task<UserBlock?> GetBlockAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default);
}
