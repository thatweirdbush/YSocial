namespace YSocial.Domain.Identities;

public interface IPasswordHasher
{
    string Hash(string password);
    bool Verify(string passwordHash, string providedPassword);
}
