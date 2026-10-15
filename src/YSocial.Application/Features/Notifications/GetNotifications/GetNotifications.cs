using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Models;
using YSocial.Application.Models.Commons;

namespace YSocial.Application.Features.Notifications.GetNotifications;

/// <summary>
/// Own notifications, newest first; notifications of blocked/deleted senders are excluded before counting and paging.
/// </summary>
public sealed record GetNotificationsQuery(int Page = 1, int PageSize = 20) : ResultQuery<NotificationPageDto>;

internal sealed class GetNotificationsQueryValidator : AbstractValidator<GetNotificationsQuery>
{
    public GetNotificationsQueryValidator()
    {
        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();
    }
}

internal sealed class GetNotificationsQueryHandler(
    AccessibleNotifications notifications,
    IUserContext userContext)
    : IRequestHandler<GetNotificationsQuery, Result<NotificationPageDto>>
{
    public async Task<Result<NotificationPageDto>> Handle(GetNotificationsQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId)
        {
            return Result<NotificationPageDto>.Unauthorized();
        }

        var visible = await notifications.LoadAsync(viewerId, cancellationToken);

        var items = PagedResponse<NotificationDto>.Slice(
                visible.Select(v => NotificationDto.From(v.Notification, v.Sender)).ToList(),
                request.Page,
                request.PageSize);

        return Result<NotificationPageDto>.Success(new NotificationPageDto(
            items,
            request.Page,
            request.PageSize,
            visible.Count,
            visible.Count(v => !v.Notification.IsRead)));
    }
}
