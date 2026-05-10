using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Abstractions.Identity;

public interface IJwtProvider
{
    string GenerateToken(User user, Account account);
}
