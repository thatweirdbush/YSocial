using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;

namespace YSocial.Application.Features.Notifications.GetUnreadCount;

/// <summary>
/// Unread notifications of the viewer (same sender-access filter as the list).
/// </summary>
public sealed record GetUnreadCountQuery : ResultQuery<UnreadCountDto>;

internal sealed class GetUnreadCountQueryHandler(
    AccessibleNotifications notifications,
    IUserContext userContext)
    : IRequestHandler<GetUnreadCountQuery, Result<UnreadCountDto>>
{
    public async Task<Result<UnreadCountDto>> Handle(GetUnreadCountQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result<UnreadCountDto>.Unauthorized();
        }

        var visible = await notifications.LoadAsync(viewerId, cancellationToken);

        return Result<UnreadCountDto>.Success(new UnreadCountDto(visible.Count(v => !v.Notification.IsRead)));
    }
}
