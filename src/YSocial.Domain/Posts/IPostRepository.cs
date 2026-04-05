using Microservice.BuildingBlocks.Domain.Repositories;

namespace YSocial.Domain.Posts;

public interface IPostRepository : IRepository<Post, PostId>
{
    Task<List<Post>> GetByAuthorIdAsync(UserId authorId);
}
