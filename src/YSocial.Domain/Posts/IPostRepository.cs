using Microservice.BuildingBlocks.Domain.Repositories;
using YSocial.Domain.Users;

namespace YSocial.Domain.Posts;

public interface IPostRepository : IRepository<Post, PostId>
{
    Task<IEnumerable<Post>> GetByAuthorIdAsync(UserId authorId, CancellationToken cancellationToken = default);
}
