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

        // Rule 1: Observer cannot follow someone they have blocked
        var hasBlockedTarget = await userBlockRepository.IsBlockedAsync(observerId, targetId, cancellationToken);
        Entity.CheckRule(new CannotFollowBlockedUserRule(hasBlockedTarget));

        // Rule 2: Target must not have blocked Observer
        var isBlockedByTarget = await userBlockRepository.IsBlockedAsync(targetId, observerId, cancellationToken);
        Entity.CheckRule(new TargetMustNotHaveBlockedObserverRule(isBlockedByTarget));

        // Get or Create relation
        var relation = await userRelationRepository.GetRelationAsync(observerId, targetId, cancellationToken);
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
        
        relation?.RemoveFollow();
        
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
}
