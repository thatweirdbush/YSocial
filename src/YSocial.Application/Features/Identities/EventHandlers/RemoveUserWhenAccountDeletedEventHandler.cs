using MediatR;
using YSocial.Domain.Identities.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.EventHandlers;

internal sealed class RemoveUserWhenAccountDeletedEventHandler(IUserRepository userRepository)
    : INotificationHandler<AccountDeletedEvent>
{
    public async Task Handle(AccountDeletedEvent notification, CancellationToken cancellationToken)
    {
        // Find the user with the same ID as the account
        // Note: This relies on the assumption that User.Id == Account.Id 
        var userId = new UserId(notification.AccountId.Value);
        var user = await userRepository.GetByIdAsync(userId, cancellationToken);

        if (user != null)
        {
            user.Delete();
            userRepository.Update(user);
        }
    }
}
