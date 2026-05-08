namespace YSocial.Application.Abstractions.Identity;

public interface IJwtProvider
{
    string GenerateToken(Guid userId, string email);
}
