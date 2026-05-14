using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.UserRelations;

public interface IUserRelationRepository : IRepository<UserRelation, UserRelationId>
{
    Task<UserRelation?> GetRelationAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default);
}
