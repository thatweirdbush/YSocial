using FluentValidation;
using Microservice.BuildingBlocks.CQRS.Commands;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Notifications.UpdateNotificationPreferences;

/// <summary>
/// Replaces the preferences of the active profile; a disabled kind is skipped from now on (no backfill when re-enabled).
/// </summary>
public sealed record UpdateNotificationPreferencesCommand(bool? Likes, bool? Replies, bool? Follows)
    : ResultCommand<NotificationPreferencesDto>;

internal sealed class UpdateNotificationPreferencesCommandValidator : AbstractValidator<UpdateNotificationPreferencesCommand>
{
    public UpdateNotificationPreferencesCommandValidator()
    {
        RuleFor(x => x.Likes).NotNull();

        RuleFor(x => x.Replies).NotNull();

        RuleFor(x => x.Follows).NotNull();
    }
}

internal sealed class UpdateNotificationPreferencesCommandHandler(
    IUserRepository userRepository,
    IUserContext userContext)
    : ICommandHandler<UpdateNotificationPreferencesCommand, Result<NotificationPreferencesDto>>
{
    public async Task<Result<NotificationPreferencesDto>> Handle(UpdateNotificationPreferencesCommand request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId
            || await userRepository.GetByIdAsync(viewerId, cancellationToken) is not { } user)
        {
            return Result<NotificationPreferencesDto>.Unauthorized();
        }

        user.UpdateNotificationPreferences(new NotificationPreferences(request.Likes!.Value, request.Replies!.Value, request.Follows!.Value));
        userRepository.Update(user);

        return Result<NotificationPreferencesDto>.Success(NotificationPreferencesDto.From(user.NotificationPreferences));
    }
}
