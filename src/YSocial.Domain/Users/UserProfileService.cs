using Microservice.BuildingBlocks.Domain.Entities;
using YSocial.Domain.Identities;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.Users;

public sealed class UserProfileService(IUserRepository userRepository)
{
    public async Task SetDefaultProfileAsync(AccountId accountId, UserId newDefaultUserId, CancellationToken ct = default)
    {
        var profiles = await userRepository.GetByAccountIdAsync(accountId, ct);

        Entity.CheckRule(new AccountMustHaveAtLeastOneProfileRule(profiles.Count));
        Entity.CheckRule(new UserMustBelongToAccountRule(profiles, newDefaultUserId));

        foreach (var user in profiles)
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

    public void VerifyDeletionRules(IReadOnlyList<User> allProfiles)
    {
        Entity.CheckRule(new AccountMustHaveAtLeastOneProfileRule(allProfiles.Count));
    }
}
