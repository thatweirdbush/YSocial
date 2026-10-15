using Microservice.BuildingBlocks.Domain.Entities;
using Microservice.BuildingBlocks.Domain.Exceptions;
using YSocial.Domain.UserBlocks;
using YSocial.Domain.UserBlocks.Rules;
using YSocial.Domain.UserRelations.Rules;
using YSocial.Domain.Users;
using YSocial.Domain.Users.Rules;

namespace YSocial.Domain.UserRelations.Services;

public sealed class UserRelationManager(
    IUserRelationRepository userRelationRepository,
    IUserBlockRepository userBlockRepository,
    IUserRepository userRepository)
{
    public async Task<UserRelation> FollowUserAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
    {
        Entity.CheckRule(new CannotFollowYourselfRule(observerId, targetId));

        var targetUser = await userRepository.GetByIdAsync(targetId, cancellationToken);
        if (targetUser is null)
        {
            throw new EntityNotFoundException($"User with ID {targetId} was not found.");
        }

        Entity.CheckRule(new CannotInteractWithDeletedUserRule(targetUser.IsDeleted));

        var (observerBlockedTarget, targetBlockedObserver) = await userBlockRepository.GetBlocksBetweenAsync(observerId, targetId, cancellationToken);

        // Rule 1: Observer cannot follow someone they have blocked
        var hasBlockedTarget = observerBlockedTarget is not null;
        Entity.CheckRule(new CannotFollowBlockedUserRule(hasBlockedTarget));

        // Rule 2: Target must not have blocked Observer
        var isBlockedByTarget = targetBlockedObserver is not null;
        Entity.CheckRule(new TargetMustNotHaveBlockedObserverRule(isBlockedByTarget));

        // Get or Create relation
        var relation = await userRelationRepository.GetRelationAsync(observerId, targetId, includeDeleted: true, cancellationToken);
        if (relation is null)
        {
            relation = UserRelation.Create(observerId, targetId);
            await userRelationRepository.AddAsync(relation, cancellationToken);
        }

        // Action
        relation.RequestFollow(targetUser.PrivacySettings.IsPrivateProfile);

        return relation;
    }

    public async Task<UserRelation?> UnfollowUserAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
    {
        var relation = await userRelationRepository.GetRelationAsync(observerId, targetId, cancellationToken);

        relation?.Delete();

        return relation;
    }

    public async Task<UserBlock> BlockUserAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken = default)
    {
        Entity.CheckRule(new CannotBlockYourselfRule(observerId, targetId));

        var block = await userBlockRepository.GetBlockAsync(observerId, targetId, cancellationToken);
        if (block is null)
        {
            block = UserBlock.Create(observerId, targetId);
            await userBlockRepository.AddAsync(block, cancellationToken);
        }

        return block;
    }

    public async Task UnblockUserAsync(UserId observerId, UserId targetId, CancellationToken cancellationToken)
    {
        Entity.CheckRule(new CannotBlockYourselfRule(observerId, targetId));

        var block = await userBlockRepository.GetBlockAsync(observerId, targetId, cancellationToken);
        if (block is not null)
        {
            block.Unblock();
            userBlockRepository.Remove(block);
        }
    }

    /// <summary>
    /// Self-mute guard (rules are internal to the Domain).
    /// </summary>
    public static void EnsureCanMute(UserId observerId, UserId targetId)
        => Entity.CheckRule(new CannotMuteYourselfRule(observerId, targetId));

    public async Task ToggleCloseFriendAsync(UserId observerId, UserId targetId, bool isCloseFriend, CancellationToken cancellationToken)
    {
        var relation = await userRelationRepository.GetRelationAsync(observerId, targetId, cancellationToken);
        Entity.CheckRule(new CloseFriendRequiresAcceptedFollowRule(relation?.FollowStatus == FollowStatus.Accepted));

        relation!.ToggleCloseFriend(isCloseFriend);
    }
}
