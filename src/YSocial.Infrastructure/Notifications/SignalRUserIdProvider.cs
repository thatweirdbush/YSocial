using Microsoft.AspNetCore.SignalR;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace YSocial.Infrastructure.Notifications;

public sealed class SignalRUserIdProvider : IUserIdProvider
{
    public string? GetUserId(HubConnectionContext connection)
    {
        return connection.User?.FindFirstValue("user_id")
            ?? connection.User?.FindFirstValue("UserId")
            ?? connection.User?.FindFirstValue(JwtRegisteredClaimNames.Sub);
    }
}
