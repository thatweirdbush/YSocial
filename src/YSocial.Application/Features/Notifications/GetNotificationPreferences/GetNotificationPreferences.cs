using MediatR;
using YSocial.Application.Abstractions.Identity;
using YSocial.Application.CQRS.Requests;
using YSocial.Application.CQRS.Results;
using YSocial.Application.Models;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Notifications.GetNotificationPreferences;

/// <summary>
/// Notification kinds the active profile receives.
/// </summary>
public sealed record GetNotificationPreferencesQuery : ResultQuery<NotificationPreferencesDto>;

internal sealed class GetNotificationPreferencesQueryHandler(
    IUserRepository userRepository,
    IUserContext userContext)
    : IRequestHandler<GetNotificationPreferencesQuery, Result<NotificationPreferencesDto>>
{
    public async Task<Result<NotificationPreferencesDto>> Handle(GetNotificationPreferencesQuery request, CancellationToken cancellationToken)
    {
        if (userContext.GetViewerId() is not { } viewerId
            || await userRepository.GetByIdAsync(viewerId, cancellationToken) is not { } user)
        {
            return Result<NotificationPreferencesDto>.Unauthorized();
        }

        return Result<NotificationPreferencesDto>.Success(NotificationPreferencesDto.From(user.NotificationPreferences));
    }
}
