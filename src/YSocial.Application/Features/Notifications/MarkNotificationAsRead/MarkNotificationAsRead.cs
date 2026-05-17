using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using Microservice.BuildingBlocks.Domain.Exceptions;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Domain.Notifications;
using YSocial.Domain.Users;

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
        var notificationId = new NotificationId(request.NotificationId);
        var currentUserId = new UserId(userContext.UserId);

        var notification = await notificationRepository.GetByIdAsync(notificationId, cancellationToken);
        if (notification is null)
        {
            throw new EntityNotFoundException($"Notification with ID {notificationId} was not found.");
        }

        notification.MarkAsRead(currentUserId);
        notificationRepository.Update(notification);

        return Result.Success();
    }
}