using YSocial.Domain.Identities;

namespace YSocial.Infrastructure.Identity;

public class BCryptPasswordHasher : IPasswordHasher
{
    // The higher the WorkFactor, the slower the hash (the safer it is against brute-force attacks)
    // 12 is the standard number for balancing security and server performance
    private const int WorkFactor = 12;

    public string Hash(string password)
    {
        // Automatically generates the Salt and embeds it into the returned Hash string
        return BCrypt.Net.BCrypt.EnhancedHashPassword(password, WorkFactor);
    }

    public bool Verify(string passwordHash, string providedPassword)
    {
        // This supports Unicode characters and offers better security
        return BCrypt.Net.BCrypt.EnhancedVerify(providedPassword, passwordHash);
    }
}
