using MediatR;
using YSocial.Domain.Countries;
using YSocial.Domain.Identities.Events;
using YSocial.Domain.Users;

namespace YSocial.Application.Features.Identities.RegisterAccount.EventHandlers;

internal sealed class InitializeUserProfileHandler(IUserRepository userRepository) 
    : INotificationHandler<AccountCreatedEvent>
{
    public async Task Handle(AccountCreatedEvent notification, CancellationToken cancellationToken)
    {
        // Use an implicit default country for now, or this could be enriched later.
        var defaultCountry = Country.Vietnam;

        // Create the first user profile as the default one for the account
        var user = User.Create(notification.AccountId, notification.Username, defaultCountry, isDefault: true);

        await userRepository.AddAsync(user, cancellationToken);
    }
}
