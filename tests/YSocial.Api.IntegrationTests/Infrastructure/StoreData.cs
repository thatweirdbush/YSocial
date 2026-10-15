using YSocial.Domain.Countries;
using YSocial.Domain.Identities;
using YSocial.Domain.UserRelations;
using YSocial.Domain.Users;
using YSocial.Infrastructure.Data;

namespace YSocial.Api.IntegrationTests.Infrastructure;

/// <summary>
/// Direct store seeding for tests that need many users or edges (events are cleared: no counters, no notifications).
/// </summary>
public static class StoreData
{
    public static User AddUser(string username, string? displayName = null, bool isDefault = true)
    {
        var user = User.Create(AccountId.New(), username, Country.Vietnam, isDefault: isDefault);
        if (displayName is not null)
        {
            user.UpdateProfile(new UserProfileInfo(displayName, null, null, null, Gender.Unspecified, null, ProfileType.Personal));
        }

        user.ClearDomainEvents();
        MockDataStore.Users.TryAdd(user.Id, user);
        return user;
    }

    public static UserRelation AddAccepted(UserId follower, UserId target)
    {
        var relation = UserRelation.Create(follower, target);
        relation.RequestFollow(isTargetPrivate: false);
        relation.ClearDomainEvents();
        MockDataStore.UserRelations.TryAdd(relation.Id, relation);
        return relation;
    }
}
