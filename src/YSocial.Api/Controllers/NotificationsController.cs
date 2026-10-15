using Microsoft.AspNetCore.Authorization;
using YSocial.Application.Features.Notifications.GetNotifications;
using YSocial.Application.Features.Notifications.GetUnreadCount;
using YSocial.Application.Features.Notifications.MarkAllNotificationsAsRead;
using YSocial.Application.Features.Notifications.MarkNotificationAsRead;

namespace YSocial.Api.Controllers;

[Authorize]
public class NotificationsController : ApiController
{
    /// <summary>
    /// Own notifications, newest first (blocked/deleted senders excluded before paging); same item shape as the SignalR push
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(NotificationPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetNotifications([FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetNotificationsQuery(page, pageSize), cancellationToken));

    /// <summary>
    /// Number of unread notifications (same filter as the list)
    /// </summary>
    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(UnreadCountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetUnreadCount(CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetUnreadCountQuery(), cancellationToken));

    /// <summary>
    /// Mark one notification as read (idempotent); only its recipient may
    /// </summary>
    [HttpPut("{id:guid}/read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarkAsRead(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new MarkNotificationAsReadCommand(id), cancellationToken));

    /// <summary>
    /// Mark every own notification as read (idempotent)
    /// </summary>
    [HttpPut("read-all")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> MarkAllAsRead(CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new MarkAllNotificationsAsReadCommand(), cancellationToken));
}
