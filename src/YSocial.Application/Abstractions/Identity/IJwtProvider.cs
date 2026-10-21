using YSocial.Domain.Identities;
using YSocial.Domain.Users;

namespace YSocial.Application.Abstractions.Identity;

public interface IJwtProvider
{
    /// <summary>
    /// <paramref name="sessionId"/> = id of the refresh token issued together with the access token (claim <c>sid</c>).
    /// </summary>
    string GenerateToken(User user, Account account, RefreshTokenId? sessionId = null);
}
