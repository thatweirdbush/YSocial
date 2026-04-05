using Microservice.BuildingBlocks.Domain.Repositories;

namespace YSocial.Domain.Users;
public interface IUserRepository : IRepository<User, UserId>
{
    Task<bool> IsEmailUniqueAsync(string email);
}
