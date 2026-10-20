using FluentValidation;
using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.CQRS.Validation;
using YSocial.Application.Models;
using YSocial.Application.Models.Commons;
using YSocial.Domain.Notifications;

namespace YSocial.Application.Features.Notifications.GetNotifications;

/// <summary>
/// Own notifications, newest first; notifications of blocked/deleted senders are excluded before counting and paging.
/// <paramref name="Kind"/> (like | reply | follow, optional) narrows the list; <c>unreadCount</c> stays overall.
/// </summary>
public sealed record GetNotificationsQuery(int Page = 1, int PageSize = 20, string? Kind = null) : ResultQuery<NotificationPageDto>;

internal sealed class GetNotificationsQueryValidator : AbstractValidator<GetNotificationsQuery>
{
    public GetNotificationsQueryValidator()
    {
        RuleFor(x => x.Page).MustBeValidPage();

        RuleFor(x => x.PageSize).MustBeValidPageSize();

        RuleFor(x => x.Kind)
            .Must(kind => string.IsNullOrEmpty(kind) || NotificationKind.TryParse(kind, out _))
            .WithMessage("Kind must be 'like', 'reply' or 'follow'.");
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

        var filtered = NotificationKind.TryParse(request.Kind, out var kind)
            ? visible.Where(v => NotificationKind.Of(v.Notification.Type) == kind).ToList()
            : visible;

        var items = PagedResponse<NotificationDto>.Slice(
                filtered.Select(v => NotificationDto.From(v.Notification, v.Sender)).ToList(),
                request.Page,
                request.PageSize);

        return Result<NotificationPageDto>.Success(new NotificationPageDto(
            items,
            request.Page,
            request.PageSize,
            filtered.Count,
            visible.Count(v => !v.Notification.IsRead)));
    }
}
