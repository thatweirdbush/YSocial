using YSocial.Domain.Identities;

namespace YSocial.Infrastructure.Identity;

public class BCryptPasswordHasher : IPasswordHasher
{
    public string Hash(string password)
    {
        return password;
    }

    public bool Verify(string passwordHash, string providedPassword)
    {
        return passwordHash == providedPassword;
    }
}
