using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Identities;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.Users;

public sealed class UserProfileService(IUserRepository userRepository)
{
    public async Task SetDefaultProfileAsync(AccountId accountId, UserId newDefaultUserId, CancellationToken ct = default)
    {
        var users = await userRepository.GetByAccountIdAsync(accountId, ct);

        Entity.CheckRule(new AccountMustHaveProfilesRule(users));
        Entity.CheckRule(new UserMustBelongToAccountRule(users, newDefaultUserId));

        foreach (var user in users)
        {
            if (user.Id == newDefaultUserId)
            {
                user.SetAsDefault();
            }
            else if (user.IsDefault)
            {
                user.UnsetAsDefault();
            }
        }
    }
}
