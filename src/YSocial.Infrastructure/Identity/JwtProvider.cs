using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using YSocial.Application.Abstractions.Identity;
using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Infrastructure.Identity;

internal sealed class JwtProvider(IConfiguration configuration) : IJwtProvider
{
    private const int DefaultAccessTokenMinutes = 15;

    public string GenerateToken(User user, Account account)
    {
        var secretKey = configuration["Jwt:SecretKey"] ?? "super-secret-key-that-should-be-long-enough-for-hs256!";
        var issuer = configuration["Jwt:Issuer"] ?? "YSocialApi";
        var audience = configuration["Jwt:Audience"] ?? "YSocialClient";
        var accessTokenMinutes = configuration.GetValue("Jwt:AccessTokenMinutes", DefaultAccessTokenMinutes);

        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, account.Id.Value.ToString()),
            new Claim("user_id", user.Id.Value.ToString()),
            new Claim(JwtRegisteredClaimNames.Email, account.Email),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(accessTokenMinutes),
            signingCredentials: creds
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
