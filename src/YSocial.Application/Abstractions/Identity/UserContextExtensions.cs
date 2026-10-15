using YSocial.Domain.Users;

namespace YSocial.Application.Abstractions.Identity;

public static class UserContextExtensions
{
    /// <summary>
    /// Viewer identity for reads: profile id from the JWT (<c>user_id</c>, NEVER the account id); null = anonymous.
    /// </summary>
    public static UserId? GetViewerId(this IUserContext userContext)
        => userContext.IsAuthenticated && userContext.UserId != Guid.Empty ? new UserId(userContext.UserId) : null;
}
