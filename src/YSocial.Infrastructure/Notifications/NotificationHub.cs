using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace YSocial.Infrastructure.Notifications;

[Authorize]
public sealed class NotificationHub : Hub
{
    // Social media hubs are usually left empty because the client only "listens" (receives)
    // and doesn't "send" anything through this hub.
    // Data sending always goes through HTTP POST/PUT commands to check rules.
}
