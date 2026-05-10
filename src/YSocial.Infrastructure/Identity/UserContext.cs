using Microsoft.AspNetCore.Http;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using YSocial.Application.Abstractions.Identity;

namespace YSocial.Infrastructure.Identity;

internal sealed class UserContext(IHttpContextAccessor httpContextAccessor) : IUserContext
{
    public Guid UserId => GetGuidFromClaim("user_id");
    public Guid AccountId => GetGuidFromClaim(JwtRegisteredClaimNames.Sub);
    public string? Email => httpContextAccessor.HttpContext?.User?.FindFirstValue(JwtRegisteredClaimNames.Email);
    public bool IsAuthenticated => httpContextAccessor.HttpContext?.User?.Identity?.IsAuthenticated ?? false;

    private Guid GetGuidFromClaim(string claimType)
    {
        var value = httpContextAccessor.HttpContext?.User?.FindFirstValue(claimType);
        return Guid.TryParse(value, out var id) ? id : Guid.Empty;
    }
}
