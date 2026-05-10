using MediatR;
using YSocial.Domain.Identities.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.EventHandlers;

internal sealed class RemoveUserWhenAccountDeletedEventHandler(IUserRepository userRepository)
    : INotificationHandler<AccountDeletedEvent>
{
    public async Task Handle(AccountDeletedEvent notification, CancellationToken cancellationToken)
    {
        // Find all users associated with the account
        var users = await userRepository.GetByAccountIdAsync(notification.AccountId, cancellationToken);

        foreach (var user in users)
        {
            user.Delete(isAccountDeletion: true);
            userRepository.Update(user);
        }
    }
}
