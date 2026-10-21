using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using YSocial.Application.Abstractions.Identity;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Identity;

internal sealed class JwtProvider(JwtSettings settings) : IJwtProvider
{
    public const string SessionClaim = "sid";

    public string GenerateToken(User user, Account account, RefreshTokenId? sessionId = null)
    {
        var claims = new List<Claim>
        {
            new Claim(JwtRegisteredClaimNames.Sub, account.Id.Value.ToString()),
            new Claim("user_id", user.Id.Value.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, account.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        if (sessionId is { } sid)
        {
            claims.Add(new Claim(SessionClaim, sid.Value.ToString()));
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(settings.SecretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: settings.Issuer,
            audience: settings.Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(settings.AccessTokenMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
