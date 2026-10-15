using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Notifications;

namespace YSocial.Application.Features.Notifications.MarkNotificationAsRead;

public sealed record MarkNotificationAsReadCommand(Guid NotificationId) : ResultCommand;

internal sealed class MarkNotificationAsReadCommandValidator : AbstractValidator<MarkNotificationAsReadCommand>
{
    public MarkNotificationAsReadCommandValidator()
    {
        RuleFor(x => x.NotificationId).NotEmpty();
    }
}

internal sealed class MarkNotificationAsReadCommandHandler(
    INotificationRepository notificationRepository,
    IUserContext userContext) : ICommandHandler<MarkNotificationAsReadCommand, Result>
{
    public async Task<Result> Handle(MarkNotificationAsReadCommand request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } currentUserId)
        {
            return Result.Unauthorized();
        }

        var notificationId = new NotificationId(request.NotificationId);

        var notification = await notificationRepository.GetByIdAsync(notificationId, cancellationToken);
        if (notification is null)
        {
            return Result.NotFound("Notification not found.");
        }

        notification.MarkAsRead(currentUserId);
        notificationRepository.Update(notification);

        return Result.Success();
    }
}