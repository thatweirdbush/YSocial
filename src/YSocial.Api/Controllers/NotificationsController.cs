using Microsoft.AspNetCore.Authorization;
using YSocial.Api.Models.Notifications;
using YSocial.Application.Features.Notifications.GetNotificationPreferences;
using YSocial.Application.Features.Notifications.GetNotifications;
using YSocial.Application.Features.Notifications.GetUnreadCount;
using YSocial.Application.Features.Notifications.MarkAllNotificationsAsRead;
using YSocial.Application.Features.Notifications.MarkNotificationAsRead;
using YSocial.Application.Features.Notifications.UpdateNotificationPreferences;

namespace YSocial.Api.Controllers;

[Authorize]
public class NotificationsController : ApiController
{
    /// <summary>
    /// Own notifications, newest first (blocked/deleted senders excluded before paging); same item shape as the SignalR push; optional <c>kind</c> = like | reply | follow
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(NotificationPageDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetNotifications([FromQuery] int page = 1, [FromQuery] int pageSize = 20, [FromQuery] string? kind = null, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new GetNotificationsQuery(page, pageSize, kind), cancellationToken));

    /// <summary>
    /// Number of unread notifications (same filter as the list)
    /// </summary>
    [HttpGet("unread-count")]
    [ProducesResponseType(typeof(UnreadCountDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetUnreadCount(CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetUnreadCountQuery(), cancellationToken));

    /// <summary>
    /// Kinds of notification the active profile receives (all on by default)
    /// </summary>
    [HttpGet("preferences")]
    [ProducesResponseType(typeof(NotificationPreferencesDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> GetPreferences(CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new GetNotificationPreferencesQuery(), cancellationToken));

    /// <summary>
    /// Replace the preferences (every field required); a disabled kind creates no notification from now on
    /// </summary>
    [HttpPut("preferences")]
    [ProducesResponseType(typeof(NotificationPreferencesDto), StatusCodes.Status200OK)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> UpdatePreferences([FromBody] UpdateNotificationPreferencesRequest request, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new UpdateNotificationPreferencesCommand(request.Likes, request.Replies, request.Follows), cancellationToken));

    /// <summary>
    /// Mark one notification as read (idempotent); only its recipient may
    /// </summary>
    [HttpPut("{id:guid}/read")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status400BadRequest)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarkAsRead(Guid id, CancellationToken cancellationToken)
        => HandleResult(await Mediator.Send(new MarkNotificationAsReadCommand(id), cancellationToken));

    /// <summary>
    /// Mark own notifications as read (idempotent); <c>upToId</c> limits it to that notification and older ones
    /// </summary>
    [HttpPut("read-all")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status401Unauthorized)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status403Forbidden)]
    [ProducesResponseType(typeof(ProblemDetails), StatusCodes.Status404NotFound)]
    public async Task<IActionResult> MarkAllAsRead([FromQuery] Guid? upToId = null, CancellationToken cancellationToken = default)
        => HandleResult(await Mediator.Send(new MarkAllNotificationsAsReadCommand(upToId), cancellationToken));
}
