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
        // Generate a simple username from email
        var rawUsername = notification.Email.Split('@')[0];
        
        // Use an implicit default country for now, or this could be enriched later.
        var defaultCountry = Country.Vietnam;

        var user = User.Create(rawUsername, defaultCountry);

        await userRepository.AddAsync(user, cancellationToken);
        
        // Note: For a robust system, the User entity might need an AccountId linkage 
        // to tie the identities system cleanly to the profile system. 
        // e.g. User.Create(notification.AccountId, rawUsername, ...)
    }
}
